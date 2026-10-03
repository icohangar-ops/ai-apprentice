import { NextResponse } from "next/server";
import { reviewTicket } from "@/lib/jev/client";
import { buildTicketState, type TicketInput } from "@/lib/jev/ticket";
import type { Discharge } from "@/lib/jev/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 48_000;

function asDischarge(value: unknown): Discharge {
  return value === "uphill" ? "uphill" : "down";
}

function readInput(body: unknown): TicketInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const source =
    typeof record.state === "object" && record.state !== null && !Array.isArray(record.state)
      ? (record.state as Record<string, unknown>)
      : record;
  if ("blob" in source || "dataUrl" in source || "bytes" in source || "image" in source) return null;
  if (typeof source.job !== "string" || typeof source.address !== "string") return null;
  return {
    job: source.job,
    address: source.address,
    unit: typeof source.unit === "string" ? source.unit : "",
    equipment: typeof source.equipment === "string" ? source.equipment : "",
    note: typeof source.note === "string" ? source.note : "",
    discharge: asDischarge(source.discharge),
    hasPlate: source.hasPlate === true,
    hasInstall: source.hasInstall === true,
    pdfRequested: source.pdfRequested === true,
    permitNumber: typeof source.permitNumber === "string" ? source.permitNumber : "",
    permitType: typeof source.permitType === "string" ? source.permitType : "",
    permitStatus: typeof source.permitStatus === "string" ? source.permitStatus : "",
  };
}

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > MAX_BODY || /data:image|;base64,/i.test(text)) {
    return NextResponse.json({ error: "Send written ticket text only, not image bytes." }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const input = readInput(body);
  if (!input) {
    return NextResponse.json({ error: "Expected a written ticket." }, { status: 400 });
  }
  const reading = await reviewTicket(buildTicketState(input), { env: process.env });
  return NextResponse.json(reading);
}
