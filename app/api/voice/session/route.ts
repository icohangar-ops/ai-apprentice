import { FIELD_PROMPT, teachPrompt } from "@/lib/agent-prompt";
import { conversationToken, elevenLabsConfigured, ensureAgent } from "@/lib/elevenlabs.server";
import { redact } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!elevenLabsConfigured()) {
    return NextResponse.json({ mode: "demo" }, { status: 200 });
  }

  let phase: "field" | "teach" = "field";
  let brief = "";
  try {
    const body = (await request.json()) as { phase?: string; brief?: string };
    if (body.phase === "teach") phase = "teach";
    if (typeof body.brief === "string") brief = body.brief.slice(0, 4000);
  } catch {
    phase = "field";
  }

  try {
    const { agent_id: agentId } = await ensureAgent();
    const token = await conversationToken(agentId);
    return NextResponse.json({
      mode: "elevenlabs",
      conversationToken: token,
      prompt: phase === "teach" ? teachPrompt(brief) : FIELD_PROMPT,
      firstMessage:
        phase === "teach"
          ? "This is a new ticket the expert never closed. Look at the discharge photo before you save. I'll stop a bad closeout."
          : "I'm on the shared screen. I'll stay quiet while you type or talk, and I'll ask when you pause. This is a training aid, not a compliance check.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the voice agent";
    return NextResponse.json({ error: redact(message) }, { status: 502 });
  }
}
