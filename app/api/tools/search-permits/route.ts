import { searchPermits, spokenCitation } from "@/lib/permits.server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let query = "";
  let source: "agent" | "tutor" | "debrief" = "tutor";
  try {
    const body = (await request.json()) as { query?: string; source?: string };
    query = typeof body.query === "string" ? body.query : "";
    if (body.source === "agent" || body.source === "debrief" || body.source === "tutor") {
      source = body.source;
    }
  } catch {
    query = "";
  }
  const result = await searchPermits(query);
  const top = result.hits[0] ?? null;
  return NextResponse.json({
    ...result,
    arguments: { query: result.query },
    sourceCaller: source,
    spoken: top ? spokenCitation(top) : null,
  });
}
