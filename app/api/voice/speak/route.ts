import { elevenLabsConfigured, synthesize } from "@/lib/elevenlabs.server";
import { redact } from "@/lib/utils";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!elevenLabsConfigured()) {
    return NextResponse.json({ error: "demo" }, { status: 409 });
  }
  let text = "";
  try {
    const body = (await request.json()) as { text?: string };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 700) : "";
  } catch {
    text = "";
  }
  if (!text) {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }
  try {
    const audio = await synthesize(text);
    return new Response(audio, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speech failed";
    return NextResponse.json({ error: redact(message) }, { status: 502 });
  }
}
