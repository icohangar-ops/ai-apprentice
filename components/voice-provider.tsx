"use client";

import { useConversation } from "@elevenlabs/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { redact } from "@/lib/utils";

export type ToolTrace = {
  id: string;
  tool: "lookup_guardrail" | "search_permits";
  code: string;
  source: "agent" | "tutor" | "debrief";
  rule: string | null;
  title: string | null;
  error: string | null;
};

export type PermitHit = {
  objectID: string;
  address: string;
  permitType: string;
  status: string;
  permitNumber: string;
  fictional: boolean;
};

export type PermitQueryResult = {
  hits: PermitHit[];
  citation: string | null;
  spoken: string | null;
  error: string | null;
  source: string;
};

type VoiceMode = "unknown" | "elevenlabs" | "demo";
type Fallback = "none" | "elevenlabs-tts" | "browser";

type LookupPayload = {
  arguments?: { code?: string };
  result?: { code?: string; title?: string; rule?: string } | null;
  error?: string | null;
};

type VoiceContextValue = {
  mode: VoiceMode;
  live: boolean;
  connecting: boolean;
  fallback: Fallback;
  speaking: boolean;
  talking: boolean;
  caption: string;
  error: string | null;
  toolTraces: ToolTrace[];
  statusLabel: string;
  connect: (phase: "field" | "teach", brief?: string) => Promise<void>;
  disconnect: () => void;
  activity: () => void;
  cue: (line: string) => void;
  noteTalking: (active: boolean) => void;
  lookup: (code: string, source: "agent" | "tutor") => Promise<LookupPayload>;
  searchPermits: (query: string, source: "agent" | "tutor" | "debrief") => Promise<PermitQueryResult>;
  lastUserText: { text: string; at: number } | null;
};

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoice() {
  const value = useContext(VoiceContext);
  if (!value) throw new Error("Voice is only available inside the apprentice app");
  return value;
}

function sessionError(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : "The agent session did not start";
  if (/fetch failed|failed to fetch|network/i.test(message)) {
    return "The live agent did not connect. Lines will use ElevenLabs speech.";
  }
  return redact(message);
}

async function playBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  await new Promise<void>((resolve) => {
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    void audio.play().catch(() => resolve());
  });
  URL.revokeObjectURL(url);
}

function browserSpeak(text: string) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<VoiceMode>("unknown");
  const [fallback, setFallback] = useState<Fallback>("none");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toolTraces, setToolTraces] = useState<ToolTrace[]>([]);
  const [talking, setTalking] = useState(false);
  const [fallbackSpeaking, setFallbackSpeaking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastUserText, setLastUserText] = useState<{ text: string; at: number } | null>(null);
  const liveRef = useRef(false);
  const modeRef = useRef<VoiceMode>("unknown");
  const talkTimer = useRef<number | null>(null);
  const activityAt = useRef(0);
  const lookupRef = useRef<(code: string, source: "agent" | "tutor") => Promise<LookupPayload>>(
    async () => ({}),
  );
  const searchRef = useRef<
    (query: string, source: "agent" | "tutor" | "debrief") => Promise<PermitQueryResult>
  >(async () => ({ hits: [], citation: null, spoken: null, error: null, source: "algolia" }));

  const conversation = useConversation({
    clientTools: {
      lookup_guardrail: async (parameters) => {
        const code = typeof parameters.code === "string" ? parameters.code : "";
        const data = await lookupRef.current(code, "agent");
        return JSON.stringify(data.result ?? { error: data.error ?? "No guardrail" });
      },
      search_permits: async (parameters) => {
        const query = typeof parameters.query === "string" ? parameters.query : "";
        const data = await searchRef.current(query, "agent");
        return JSON.stringify({
          citation: data.citation,
          spoken: data.spoken,
          hits: data.hits.slice(0, 3),
          error: data.error,
        });
      },
    },
    onConnect: () => {
      liveRef.current = true;
      setFallback("none");
      setError(null);
      setConnecting(false);
    },
    onDisconnect: () => {
      liveRef.current = false;
    },
    onError: (message) => {
      const clean = redact(message);
      setError(clean);
      if (!liveRef.current) {
        setFallback(modeRef.current === "elevenlabs" ? "elevenlabs-tts" : "browser");
        setConnecting(false);
      }
    },
    onMessage: (payload) => {
      const text = payload.message?.trim();
      if (!text || text.startsWith("CUE.")) return;
      if (payload.role === "user" || payload.source === "user") {
        setLastUserText({ text, at: Date.now() });
        return;
      }
      setCaption(text);
    },
    onVadScore: ({ vadScore }) => {
      if (vadScore < 0.55) return;
      setTalking(true);
      if (talkTimer.current) window.clearTimeout(talkTimer.current);
      talkTimer.current = window.setTimeout(() => setTalking(false), 900);
    },
  });

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/voice/status")
      .then((response) => response.json())
      .then((data: { mode?: string }) => {
        if (cancelled) return;
        const next = data.mode === "elevenlabs" ? "elevenlabs" : "demo";
        modeRef.current = next;
        setMode(next);
        if (next === "demo") setFallback("browser");
      })
      .catch(() => {
        if (cancelled) return;
        modeRef.current = "demo";
        setMode("demo");
        setFallback("browser");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const lookup = useCallback(async (code: string, source: "agent" | "tutor") => {
    const response = await fetch("/api/tools/lookup-guardrail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, source }),
    });
    const data = (await response.json()) as LookupPayload;
    setToolTraces((prev) =>
      [
        {
          id: `${Date.now()}-${code}-${source}`,
          tool: "lookup_guardrail" as const,
          code: data.arguments?.code || code.toUpperCase(),
          source,
          rule: data.result?.rule ?? null,
          title: data.result?.title ?? null,
          error: data.error ?? null,
        },
        ...prev,
      ].slice(0, 6),
    );
    return data;
  }, []);

  const searchPermits = useCallback(async (query: string, source: "agent" | "tutor" | "debrief") => {
    const response = await fetch("/api/tools/search-permits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, source }),
    });
    const data = (await response.json()) as PermitQueryResult & {
      arguments?: { query?: string };
    };
    const top = data.hits?.[0];
    setToolTraces((prev) =>
      [
        {
          id: `${Date.now()}-permit-${source}`,
          tool: "search_permits" as const,
          code: data.arguments?.query || query,
          source,
          rule: data.spoken ?? data.citation,
          title: top ? `${top.permitNumber} · ${top.status}` : null,
          error: data.error,
        },
        ...prev,
      ].slice(0, 6),
    );
    return {
      hits: data.hits ?? [],
      citation: data.citation,
      spoken: data.spoken,
      error: data.error,
      source: data.source,
    };
  }, []);

  useEffect(() => {
    lookupRef.current = lookup;
    searchRef.current = searchPermits;
  }, [lookup, searchPermits]);

  const speakFallback = useCallback(async (line: string) => {
    setFallbackSpeaking(true);
    setCaption(line);
    try {
      if (modeRef.current === "elevenlabs") {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: line }),
        });
        if (response.ok) {
          setFallback("elevenlabs-tts");
          await playBlob(await response.blob());
          return;
        }
      }
      setFallback(modeRef.current === "elevenlabs" ? "browser" : "browser");
      await browserSpeak(line);
    } finally {
      setFallbackSpeaking(false);
    }
  }, []);

  const cue = useCallback(
    (line: string) => {
      const clean = line.trim();
      if (!clean) return;
      if (liveRef.current && conversation.status === "connected") {
        conversation.sendUserMessage(
          `CUE. Say this in one turn, then stop. Do not add another question: ${clean}`,
        );
        setCaption(clean);
        return;
      }
      void speakFallback(clean);
    },
    [conversation, speakFallback],
  );

  const activity = useCallback(() => {
    const now = Date.now();
    if (now - activityAt.current < 350) return;
    activityAt.current = now;
    if (liveRef.current && conversation.status === "connected") {
      conversation.sendUserActivity();
    }
  }, [conversation]);

  const connect = useCallback(
    async (phase: "field" | "teach", brief = "") => {
      if (modeRef.current !== "elevenlabs") {
        setFallback("browser");
        return;
      }
      setConnecting(true);
      setError(null);
      try {
        const response = await fetch("/api/voice/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase, brief }),
        });
        const data = (await response.json()) as {
          conversationToken?: string;
          prompt?: string;
          firstMessage?: string;
          error?: string;
        };
        if (!response.ok || !data.conversationToken) {
          setFallback("elevenlabs-tts");
          setError(data.error ?? "The agent session did not start. Lines will use ElevenLabs speech.");
          setConnecting(false);
          return;
        }
        const started = conversation.startSession({
          conversationToken: data.conversationToken,
          overrides: {
            agent: {
              prompt: { prompt: data.prompt },
              firstMessage: data.firstMessage,
              language: "en",
            },
            asr: {
              keywords: ["Northline", "T&P", "guardrail", "closeout", "WO-1842", "WO-2218"],
            },
          },
        });
        await Promise.race([
          Promise.resolve(started).catch((caught: unknown) => {
            setFallback("elevenlabs-tts");
            setError(sessionError(caught));
          }),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
        setConnecting(false);
      } catch (caught) {
        setFallback("elevenlabs-tts");
        setError(sessionError(caught));
        setConnecting(false);
      }
    },
    [conversation],
  );

  const disconnect = useCallback(() => {
    liveRef.current = false;
    if (conversation.status === "connected" || conversation.status === "connecting") {
      conversation.endSession();
    }
  }, [conversation]);

  const noteTalking = useCallback((active: boolean) => {
    setTalking(active);
  }, []);

  const live = conversation.status === "connected";
  const connectingNow = connecting || conversation.status === "connecting";
  const speaking = conversation.isSpeaking || fallbackSpeaking;

  const statusLabel = connectingNow
    ? "Connecting to the ElevenLabs agent…"
    : mode === "unknown"
      ? "Checking voice…"
      : mode === "demo"
        ? "Demo mode · browser speech"
        : live
          ? "ElevenLabs agent · Scribe listening"
          : fallback === "browser"
            ? "Browser speech fallback"
            : error
              ? "ElevenLabs speech · the live agent did not connect"
              : "ElevenLabs agent · Scribe starts with the closeout";

  const value = useMemo<VoiceContextValue>(
    () => ({
      mode,
      live,
      connecting: connectingNow,
      fallback,
      speaking,
      talking,
      caption,
      error,
      toolTraces,
      statusLabel,
      connect,
      disconnect,
      activity,
      cue,
      noteTalking,
      lookup,
      searchPermits,
      lastUserText,
    }),
    [
      mode,
      live,
      connectingNow,
      fallback,
      speaking,
      talking,
      caption,
      error,
      toolTraces,
      statusLabel,
      connect,
      disconnect,
      activity,
      cue,
      noteTalking,
      lookup,
      searchPermits,
      lastUserText,
    ],
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}
