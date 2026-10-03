import { choice } from "@/lib/jev/questions";
import type { ChoiceQuestion, Discharge, JevSaveReading, SaveChoice, TicketState } from "@/lib/jev/types";
import type { BlockReason } from "@/lib/types";
import { noteHasPersonalPhone } from "@/lib/logic";

export const DEFAULT_MODEL = "jev-1.13.0";
export const DEFAULT_URL = "https://thejevai.com/v1/systemone";

const NOTE_LIMIT = 1200;

export const SAVE_CRITERIA = {
  allow: "The written ticket can be saved and the PDF can be sent.",
  hold: "Do not save and do not send the PDF. Leave the ticket open.",
} as const;

const PHONE_PATTERN = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/g;

export function scrubNote(value: string): string {
  return value
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[image omitted]")
    .replace(PHONE_PATTERN, "[phone omitted]")
    .trim()
    .slice(0, NOTE_LIMIT);
}

export type TicketInput = {
  job: string;
  address: string;
  unit: string;
  equipment: string;
  note: string;
  discharge: Discharge;
  hasPlate: boolean;
  hasInstall: boolean;
  pdfRequested: boolean;
  permitNumber?: string;
  permitType?: string;
  permitStatus?: string;
};

function text(value: string | undefined, limit: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export function buildTicketState(input: TicketInput): TicketState {
  return {
    job: text(input.job, 40),
    address: text(input.address, 200),
    unit: text(input.unit, 40),
    equipment: text(input.equipment, 120),
    note: scrubNote(input.note),
    noteHasPhone: noteHasPersonalPhone(input.note),
    discharge: input.discharge === "uphill" ? "uphill" : "down",
    hasPlate: input.hasPlate === true,
    hasInstall: input.hasInstall === true,
    pdfRequested: input.pdfRequested === true,
    permitNumber: text(input.permitNumber, 40),
    permitType: text(input.permitType, 80),
    permitStatus: text(input.permitStatus, 40),
  };
}

export function saveQuestion(): ChoiceQuestion {
  return choice(
    "Should this written ticket be saved and the closeout PDF sent? Use only the written fields. You do not see photos. Choose hold when the discharge runs uphill, the data plate is missing, the note has a phone number, or the permit status is expired.",
    { ...SAVE_CRITERIA },
  );
}

export function buildRequest(state: TicketState, model = DEFAULT_MODEL) {
  return {
    model,
    state,
    questions: { save: saveQuestion() },
  };
}

export function jevReason(choice: SaveChoice, confidence: number | null): string {
  const sentence = SAVE_CRITERIA[choice];
  const confidenceText =
    confidence == null ? "" : ` Confidence ${Math.round(confidence * 100)}%.`;
  return `Jev chose ${choice}. ${sentence}${confidenceText}`;
}

export const JEV_UNREACHABLE = "Jev did not answer. The local guardrail still applies.";

export function localReading(): JevSaveReading {
  return {
    configured: false,
    source: "local",
    choice: null,
    reason: null,
    model: null,
    confidence: null,
    error: null,
  };
}

export function failedReading(): JevSaveReading {
  return {
    configured: true,
    source: "local",
    choice: null,
    reason: null,
    model: null,
    confidence: null,
    error: JEV_UNREACHABLE,
  };
}

export type LocalVerdict = { ok: true } | { ok: false; reason: BlockReason; code: string };

export function decideSave(input: { local: LocalVerdict; jev: JevSaveReading | null }): {
  save: boolean;
  stoppedBy: "local" | "jev" | null;
  code: string | null;
  jev: JevSaveReading | null;
} {
  if (!input.local.ok) {
    return { save: false, stoppedBy: "local", code: input.local.code, jev: input.jev };
  }
  if (input.jev?.source === "jev" && input.jev.choice === "hold") {
    return { save: false, stoppedBy: "jev", code: "Jev", jev: input.jev };
  }
  return { save: true, stoppedBy: null, code: null, jev: input.jev };
}

export function withJevReason(spoken: string, jev: JevSaveReading | null): string {
  if (!jev) return spoken;
  if (jev.reason) return `${spoken} ${jev.reason}`;
  if (jev.error) return `${spoken} ${jev.error}`;
  return spoken;
}

export function isJevSaveReading(value: unknown): value is JevSaveReading {
  if (typeof value !== "object" || value === null) return false;
  const reading = value as Partial<JevSaveReading>;
  const choiceOk = reading.choice === null || reading.choice === "allow" || reading.choice === "hold";
  return (
    typeof reading.configured === "boolean" &&
    (reading.source === "jev" || reading.source === "local") &&
    choiceOk &&
    (reading.reason === null || typeof reading.reason === "string") &&
    (reading.error === null || typeof reading.error === "string")
  );
}
