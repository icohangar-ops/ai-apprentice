import { lookupGuardrail } from "@/lib/guardrails";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let code = "";
  let source: "agent" | "tutor" = "tutor";
  try {
    const body = (await request.json()) as { code?: string; source?: string };
    code = typeof body.code === "string" ? body.code : "";
    if (body.source === "agent") source = "agent";
  } catch {
    code = "";
  }
  const result = lookupGuardrail(code);
  return NextResponse.json({
    tool: "lookup_guardrail",
    arguments: { code: code.trim().toUpperCase() },
    source,
    result,
    error: result ? null : "No guardrail with that code.",
  });
}
