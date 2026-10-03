import type { Guardrail } from "./types";

export const GUARDRAILS: Guardrail[] = [
  {
    code: "GR-04",
    title: "Photo set for a water-heater changeout",
    topic: "photos",
    rule: "Closeout photos must include the data plate and the finished install. A before photo does not replace either shot.",
  },
  {
    code: "GR-07",
    title: "No personal data in the work note",
    topic: "note",
    rule: "The work note must not include a phone number, email, or payment detail. Those stay on the customer record. The note is copied onto the PDF.",
  },
  {
    code: "GR-11",
    title: "T&P discharge hold",
    topic: "discharge",
    rule: "If the temperature-and-pressure relief discharge is missing, kinked, capped, or runs uphill, do not mark the job complete and do not send the closeout PDF. Leave the ticket open. Van crews do not override this hold.",
  },
  {
    code: "GR-02",
    title: "Branded closeout PDF",
    topic: "pdf",
    rule: "The PDF must show the Northline wordmark and the job number. The filename carries the company, the job number, and the street number, not the customer name. Do not send a loose photo roll instead.",
  },
];

export function lookupGuardrail(code: string): Guardrail | null {
  const normalized = code.trim().toUpperCase();
  return GUARDRAILS.find((item) => item.code === normalized) ?? null;
}

export const TOOL_SPEC = {
  name: "lookup_guardrail",
  description:
    "Look up a Northline field guardrail by code. Use this before explaining a hold or a blocked save.",
  inputSchema: {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "Guardrail code such as GR-11",
      },
    },
    required: ["code"],
  },
} as const;
