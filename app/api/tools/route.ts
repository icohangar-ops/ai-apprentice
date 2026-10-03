import { TOOL_SPEC } from "@/lib/guardrails";
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    tools: [
      TOOL_SPEC,
      {
        name: "search_permits",
        description:
          "Search the public_permits index by address, permit type, or status, and cite the hit.",
        inputSchema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Address, permit type, or status" },
          },
          required: ["query"],
        },
      },
    ],
    note: "Guardrail lookup is local. Permit search uses the Algolia index public_permits. Sample records are fictional.",
  });
}
