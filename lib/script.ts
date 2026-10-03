import type { ScreenState } from "./types";

export type ScriptQuestion = {
  id: string;
  phase: "capture" | "debrief";
  topic: string;
  guardrailCode?: string;
  prompt: string;
  sample: string;
  trigger?: (screen: ScreenState) => boolean;
};

export const CAPTURE_QUESTIONS: ScriptQuestion[] = [
  {
    id: "q-open",
    phase: "capture",
    topic: "open",
    prompt:
      "You're on Maya Chen's heater, and the record is fictional. Before you click anything, what are you about to prove with this closeout?",
    sample:
      "That we changed the unit on the ticket, the discharge is safe, and the office can file it without calling me.",
    trigger: () => true,
  },
  {
    id: "q-photos",
    phase: "capture",
    topic: "photos",
    guardrailCode: "GR-04",
    prompt:
      "You took the data plate and the finished install. Why that pair, and why isn't a before photo enough to close?",
    sample:
      "The plate proves which unit we put in. The finished shot proves it's in the closet and piped. A before photo is just the old tank. I keep both.",
    trigger: (screen) => screen.photos.plate && screen.photos.install,
  },
  {
    id: "q-note",
    phase: "capture",
    topic: "note",
    guardrailCode: "GR-07",
    prompt:
      "You left the phone number out of the note. Is that a habit, or a rule, and what happens if a new hire pastes it in?",
    sample:
      "It's a rule. The note is copied onto the PDF and emailed around. Phone numbers stay on the customer record, not in the note.",
    trigger: (screen) => screen.note.trim().length >= 12,
  },
  {
    id: "q-discharge",
    phase: "capture",
    topic: "discharge",
    guardrailCode: "GR-11",
    prompt:
      "This discharge drops toward the floor. If the line ran uphill, would you still generate the PDF? Which rule stops you?",
    sample:
      "No. If it runs uphill I leave the job open and call the office. I don't generate the PDF to clear the board. That's the T&P hold.",
    trigger: (screen) => screen.photos.discharge,
  },
  {
    id: "q-pdf",
    phase: "capture",
    topic: "pdf",
    guardrailCode: "GR-02",
    prompt:
      "The PDF has the Northline wordmark and WO-1842. What has to be true about this file before you send it?",
    sample:
      "It has to be our branded closeout, the job number has to match the ticket, and I send it from this screen. Not a loose photo roll.",
    trigger: (screen) => screen.pdfOpen,
  },
];

export const DEBRIEF_QUESTIONS: ScriptQuestion[] = [
  {
    id: "d-refuse",
    phase: "debrief",
    topic: "refuse-photo",
    prompt:
      "On this job they let you shoot the after photo. What do you do when a customer refuses it?",
    sample:
      "I write that they declined the after photo, I shoot what they allow, and I leave that photo step flagged. I don't pretend I took it.",
  },
  {
    id: "d-override",
    phase: "debrief",
    topic: "override",
    prompt:
      "You said an uphill discharge stays open. Can anyone in the van override that hold, or does it stay with the office?",
    sample:
      "Nobody in the van overrides a T&P hold. The office does, and only in writing on the ticket.",
  },
  {
    id: "d-filename",
    phase: "debrief",
    topic: "filename",
    prompt:
      "The file is named Northline_WO-1842_418-Harbor.pdf. Besides the job number, what belongs in the filename, and what stays out?",
    sample:
      "Company, job number, and street number. No customer name in the filename.",
  },
];

export const OFF_RECORD_SAMPLE =
  "If Closeout crashes I sometimes text the dispatcher a photo from my personal phone. Don't teach that.";

export const REQUIRED_CAPTURE_IDS = ["q-photos", "q-note", "q-discharge"] as const;

export function nextCaptureQuestion(
  screen: ScreenState,
  askedIds: string[],
): ScriptQuestion | null {
  for (const question of CAPTURE_QUESTIONS) {
    if (askedIds.includes(question.id)) continue;
    if (question.trigger?.(screen)) return question;
  }
  return null;
}
