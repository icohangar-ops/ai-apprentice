import { readAgentCache, writeAgentCache, type AgentCache } from "./agent-cache";
import { FIELD_PROMPT } from "./agent-prompt";
import { redact } from "./utils";

const AGENT_NAME = "Northline Apprentice";
const TOOL_NAME = "lookup_guardrail";
const PERMIT_TOOL_NAME = "search_permits";

export function elevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error("ElevenLabs is not configured");
  return key;
}

async function el(pathname: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("xi-api-key", apiKey());
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`https://api.elevenlabs.io${pathname}`, { ...init, headers });
}

async function createPermitTool(): Promise<string> {
  const response = await el("/v1/convai/tools", {
    method: "POST",
    body: JSON.stringify({
      tool_config: {
        type: "client",
        name: PERMIT_TOOL_NAME,
        description:
          "Search the public permit index by address, permit type, or status. Cite the address, permit type, and status from the hit. Sample records are fictional training data, not city filings.",
        expects_response: true,
        parameters: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description: "Address, permit type, or status. Example: 90 Pike Street",
            },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(redact(await response.text()));
  }
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("ElevenLabs did not return a permit tool id");
  return body.id;
}

async function attachTool(agentId: string, toolId: string): Promise<void> {
  const current = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`);
  if (!current.ok) {
    throw new Error(redact(await current.text()));
  }
  const agent = (await current.json()) as {
    conversation_config?: {
      agent?: { prompt?: { prompt?: string; llm?: string; tool_ids?: string[] } };
    };
  };
  const prompt = agent.conversation_config?.agent?.prompt;
  const toolIds = new Set(prompt?.tool_ids ?? []);
  if (toolIds.has(toolId)) return;
  toolIds.add(toolId);
  const updated = await el(`/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      conversation_config: {
        agent: {
          prompt: {
            prompt: prompt?.prompt,
            llm: prompt?.llm,
            tool_ids: [...toolIds],
          },
        },
      },
    }),
  });
  if (!updated.ok) {
    throw new Error(redact(await updated.text()));
  }
}

async function createTool(): Promise<string> {
  const response = await el("/v1/convai/tools", {
    method: "POST",
    body: JSON.stringify({
      tool_config: {
        type: "client",
        name: TOOL_NAME,
        description:
          "Look up a Northline field guardrail by code such as GR-02, GR-04, GR-07, or GR-11. Call this before explaining a blocked save or a hold.",
        expects_response: true,
        parameters: {
          type: "object",
          required: ["code"],
          properties: {
            code: {
              type: "string",
              description: "Guardrail code, for example GR-11",
            },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(redact(await response.text()));
  }
  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("ElevenLabs did not return a tool id");
  return body.id;
}

async function createAgent(toolId: string): Promise<string> {
  const response = await el("/v1/convai/agents/create", {
    method: "POST",
    body: JSON.stringify({
      name: AGENT_NAME,
      conversation_config: {
        asr: { quality: "high", provider: "scribe_realtime" },
        turn: {
          turn_timeout: 30,
          turn_eagerness: "patient",
          silence_end_call_timeout: -1,
        },
        tts: { model_id: "eleven_flash_v2" },
        conversation: { max_duration_seconds: 1800 },
        agent: {
          first_message:
            "I'm on the shared screen. I'll stay quiet while you type or talk, and I'll ask when you pause.",
          language: "en",
          prompt: {
            prompt: FIELD_PROMPT,
            llm: "gemini-2.5-flash",
            tool_ids: [toolId],
          },
        },
      },
      platform_settings: {
        overrides: {
          conversation_config_override: {
            agent: {
              first_message: true,
              prompt: { prompt: true },
            },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(redact(await response.text()));
  }
  const body = (await response.json()) as { agent_id?: string };
  if (!body.agent_id) throw new Error("ElevenLabs did not return an agent id");
  return body.agent_id;
}

async function findExistingAgent(): Promise<string | null> {
  const response = await el("/v1/convai/agents?page_size=30");
  if (!response.ok) return null;
  const body = (await response.json()) as {
    agents?: { agent_id?: string; name?: string }[];
  };
  const match = body.agents?.find((agent) => agent.name === AGENT_NAME && agent.agent_id);
  return match?.agent_id ?? null;
}

let pending: Promise<AgentCache> | null = null;

export async function ensureAgent(): Promise<AgentCache> {
  if (!pending) {
    pending = (async () => {
      const cached = await readAgentCache();
      const toolId = cached?.tool_id ?? (await createTool());
      const agentId = cached?.agent_id ?? ((await findExistingAgent()) ?? (await createAgent(toolId)));
      const permitToolId = cached?.permit_tool_id ?? (await createPermitTool());
      await attachTool(agentId, permitToolId);
      const finalCache = { agent_id: agentId, tool_id: toolId, permit_tool_id: permitToolId };
      await writeAgentCache(finalCache);
      return finalCache;
    })().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

export async function conversationToken(agentId: string): Promise<string> {
  const response = await el(
    `/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
  );
  if (!response.ok) {
    throw new Error(redact(await response.text()));
  }
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error("ElevenLabs did not return a conversation token");
  return body.token;
}

export async function synthesize(text: string): Promise<ArrayBuffer> {
  const response = await el(
    "/v1/text-to-speech/cjVigY5qzO86Huf0OWal?output_format=mp3_22050_32",
    {
      method: "POST",
      body: JSON.stringify({
        text,
        model_id: "eleven_flash_v2",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(redact(await response.text()));
  }
  return response.arrayBuffer();
}
