import { elevenLabsConfigured } from "@/lib/elevenlabs.server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const configured = elevenLabsConfigured();
  return NextResponse.json({
    mode: configured ? "elevenlabs" : "demo",
    asr: configured ? "scribe_realtime" : null,
    label: configured
      ? "ElevenLabs agent · Scribe listening"
      : "Demo mode · browser speech",
  });
}
