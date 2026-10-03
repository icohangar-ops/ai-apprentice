import { GUARDRAILS, lookupGuardrail } from "./guardrails";
import { DEBRIEF_QUESTIONS } from "./script";
import type {
  Answer,
  BlockReason,
  Guardrail,
  MapNode,
  Moment,
  ScreenState,
  TeachBackLine,
} from "./types";

const PHONE_PATTERN =
  /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/;

export const IDLE_BEFORE_ASK_MS = 1400;

export function noteHasPersonalPhone(note: string): boolean {
  return PHONE_PATTERN.test(note);
}

export function shouldAsk(input: {
  pending: boolean;
  typing: boolean;
  talking: boolean;
  speaking: boolean;
  idleMs: number;
}): boolean {
  if (!input.pending) return false;
  if (input.typing || input.talking || input.speaking) return false;
  return input.idleMs >= IDLE_BEFORE_ASK_MS;
}

export function publicAnswers(answers: Answer[]): Answer[] {
  return answers.filter((answer) => !answer.offRecord && answer.text.trim().length > 0);
}

export function quoteForTopic(answers: Answer[], topic: string): string | null {
  const match = publicAnswers(answers).find((answer) => answer.topic === topic);
  return match?.text ?? null;
}

export function buildTeachBack(answers: Answer[], expertName: string): TeachBackLine[] {
  const specs: { id: string; topic: string; lead: string }[] = [
    {
      id: "tb-open",
      topic: "open",
      lead: `${expertName} closes a ticket only when the office can file it without a callback.`,
    },
    {
      id: "tb-photos",
      topic: "photos",
      lead: "Keep the data plate and the finished install. A before photo is not enough.",
    },
    {
      id: "tb-note",
      topic: "note",
      lead: "Phone numbers stay out of the work note.",
    },
    {
      id: "tb-discharge",
      topic: "discharge",
      lead: "If the T&P discharge runs uphill, do not send the PDF. Leave the job open.",
    },
    {
      id: "tb-pdf",
      topic: "pdf",
      lead: "Send the branded Northline PDF from the closeout screen, with the job number on it.",
    },
    {
      id: "tb-refuse",
      topic: "refuse-photo",
      lead: "If the customer refuses the after photo, flag that step instead of inventing the shot.",
    },
    {
      id: "tb-override",
      topic: "override",
      lead: "A T&P hold is not overridden from the van.",
    },
    {
      id: "tb-filename",
      topic: "filename",
      lead: "The filename carries the company, job number, and street number.",
    },
  ];

  return specs.map((spec) => {
    const source = answers.find((answer) => answer.topic === spec.topic && answer.text.trim());
    if (!source) {
      return {
        id: spec.id,
        topic: spec.topic,
        text: spec.lead,
        sourceId: null,
        teachable: false,
      };
    }
    if (source.offRecord) {
      return {
        id: spec.id,
        topic: spec.topic,
        text: "Held off the record. This wording stays with the expert and is not taught.",
        sourceId: source.id,
        teachable: false,
      };
    }
    return {
      id: spec.id,
      topic: spec.topic,
      text: `${spec.lead} ${expertName} put it this way: "${source.text.trim()}"`,
      sourceId: source.id,
      teachable: true,
    };
  });
}

export function onRecordBrief(lines: TeachBackLine[], expertName: string): string {
  const taught = lines.filter((line) => line.teachable);
  if (taught.length === 0) {
    return `${expertName} confirmed no teachable lines. Use the guardrail text only. Do not invent their wording.`;
  }
  return taught.map((line) => `- ${line.text}`).join("\n");
}

export type SaveInput = {
  action: "save" | "hold";
  note: string;
  discharge: "down" | "uphill";
  hasPlate: boolean;
};

export function evaluateNewHire(
  input: SaveInput,
): { ok: true } | { ok: false; reason: BlockReason; code: string } {
  if (noteHasPersonalPhone(input.note)) {
    return { ok: false, reason: "pii", code: "GR-07" };
  }
  if (input.action === "hold") {
    if (input.discharge === "uphill" && input.hasPlate) return { ok: true };
    if (!input.hasPlate) return { ok: false, reason: "missing-plate", code: "GR-04" };
    return { ok: true };
  }
  if (input.discharge === "uphill") {
    return { ok: false, reason: "uphill", code: "GR-11" };
  }
  if (!input.hasPlate) {
    return { ok: false, reason: "missing-plate", code: "GR-04" };
  }
  return { ok: true };
}

export function explainBlock(input: {
  reason: BlockReason;
  code: string;
  expertName: string;
  answers: Answer[];
  guardrail: Guardrail | null;
  lines?: TeachBackLine[];
}): string {
  const rule =
    input.guardrail?.rule ??
    lookupGuardrail(input.code)?.rule ??
    "The matching guardrail could not be loaded.";
  const topic =
    input.reason === "uphill" ? "discharge" : input.reason === "pii" ? "note" : "photos";
  const taught = input.lines?.find((line) => line.topic === topic && line.teachable)?.text ?? null;
  const quote = taught ?? quoteForTopic(input.answers, topic);
  const withheld = input.answers.some(
    (answer) => answer.topic === topic && answer.offRecord && answer.text.trim(),
  );

  const action =
    input.reason === "uphill"
      ? "Don't save, and don't send the PDF. The discharge in this photo runs uphill."
      : input.reason === "pii"
        ? "Don't save. That note has a phone number in it."
        : "Don't save. The data plate photo is missing.";

  const attribution = quote
    ? taught
      ? `What ${input.expertName} confirmed: ${quote}`
      : `On the job ${input.expertName} actually closed, they said: "${quote}"`
    : withheld
      ? `${input.expertName} marked their wording for this off the record, so I will not repeat it.`
      : `${input.expertName} did not leave an on-record line for this, so I'm staying with the guardrail text.`;

  return `Stop. ${action} I looked up ${input.code}. ${rule} ${attribution} This Pike Street ticket is a different job. Leave it open. Nothing was sent.`;
}

export function explainHold(expertName: string, answers: Answer[]): string {
  const quote = quoteForTopic(answers, "discharge");
  const attribution = quote
    ? `${expertName} put it this way: "${quote}"`
    : `${expertName} did not leave an on-record line for the hold, so this follows GR-11.`;
  return `That's the call. The ticket stays open, and nothing was sent. ${attribution}`;
}

export function answerSideQuestion(input: {
  question: string;
  answers: Answer[];
  expertName: string;
}): { spoken: string; leaked: boolean } {
  const askingAboutPersonalPhone = /personal phone|text (the|a) (pdf|photo|dispatcher)/i.test(
    input.question,
  );
  const hidden = input.answers.filter((answer) => answer.offRecord).map((answer) => answer.text);
  const onRecord = publicAnswers(input.answers)
    .map((answer) => answer.text)
    .join(" ");

  let spoken: string;
  if (askingAboutPersonalPhone) {
    const pdf = lookupGuardrail("GR-02");
    spoken = `I don't have on-record words from ${input.expertName} about texting from a personal phone. I won't fill that in. What I can teach is ${pdf?.code}: ${pdf?.rule}`;
  } else {
    spoken = onRecord
      ? `From what ${input.expertName} left on the record: ${onRecord}`
      : `I don't have on-record words from ${input.expertName} for that. I won't guess.`;
  }

  const leaked = hidden.some((secret) => secret.trim().length > 0 && spoken.includes(secret.trim()));
  return { spoken, leaked };
}

const STEP_META: {
  stepId: string;
  title: string;
  detail: string;
  topic: string | null;
  guardrailCode?: string;
}[] = [
  {
    stepId: "open",
    title: "Open the closeout",
    detail: "Start on the ticket you were dispatched, and say what done means before you touch the photos.",
    topic: "open",
  },
  {
    stepId: "plate",
    title: "Photograph the data plate",
    detail: "The plate has to be readable. It is how the office matches the unit.",
    topic: "photos",
    guardrailCode: "GR-04",
  },
  {
    stepId: "install",
    title: "Photograph the finished install",
    detail: "The finished closet, not the old tank. Both shots stay.",
    topic: "photos",
  },
  {
    stepId: "discharge",
    title: "Photograph the T&P discharge",
    detail: "The line should drop and end near the floor. Uphill means the ticket stays open.",
    topic: "discharge",
    guardrailCode: "GR-11",
  },
  {
    stepId: "note",
    title: "Write the work note",
    detail: "What you did, in the van's language. No phone number.",
    topic: "note",
    guardrailCode: "GR-07",
  },
  {
    stepId: "pdf",
    title: "Preview the branded PDF",
    detail: "Wordmark, job number, and a filename the office can file.",
    topic: "pdf",
    guardrailCode: "GR-02",
  },
];

function momentForStep(moments: Moment[], stepId: string): Moment | null {
  const matches = moments.filter((moment) => moment.stepId === stepId);
  return matches.length ? matches[matches.length - 1] : null;
}

function wordsFor(
  answers: Answer[],
  topic: string | null,
): { words: string | null; prompt: string | null; offRecord: boolean } {
  if (!topic) return { words: null, prompt: null, offRecord: false };
  const sources = answers.filter((answer) => answer.topic === topic && answer.text.trim());
  if (sources.length === 0) return { words: null, prompt: null, offRecord: false };
  const hidden = sources.every((answer) => answer.offRecord);
  if (hidden) {
    return {
      words: null,
      prompt: sources[0]?.prompt ?? null,
      offRecord: true,
    };
  }
  const visible = sources.find((answer) => !answer.offRecord);
  return {
    words: visible?.text ?? null,
    prompt: visible?.prompt ?? null,
    offRecord: false,
  };
}

export function buildWorkMap(input: {
  moments: Moment[];
  answers: Answer[];
}): MapNode[] {
  const nodes: MapNode[] = [];
  for (const step of STEP_META) {
    const spoken = wordsFor(input.answers, step.topic);
    nodes.push({
      id: `step-${step.stepId}`,
      kind: "step",
      title: step.title,
      detail: step.detail,
      stepId: step.stepId,
      guardrailCode: step.guardrailCode,
      moment: momentForStep(input.moments, step.stepId),
      prompt: spoken.prompt,
      expertWords: spoken.words,
      offRecord: spoken.offRecord,
    });
    if (step.guardrailCode) {
      const guardrail = GUARDRAILS.find((item) => item.code === step.guardrailCode);
      nodes.push({
        id: `guard-${step.guardrailCode}-${step.stepId}`,
        kind: "guardrail",
        title: guardrail ? `${guardrail.code} · ${guardrail.title}` : step.guardrailCode,
        detail: guardrail?.rule ?? "",
        stepId: step.stepId,
        guardrailCode: step.guardrailCode,
        moment: momentForStep(input.moments, step.stepId),
        prompt: spoken.prompt,
        expertWords: spoken.words,
        offRecord: spoken.offRecord,
      });
    }
  }

  for (const question of DEBRIEF_QUESTIONS) {
    const spoken = wordsFor(input.answers, question.topic);
    if (!spoken.words && !spoken.offRecord) continue;
    nodes.push({
      id: `debrief-${question.id}`,
      kind: "step",
      title: "Debrief",
      detail: question.prompt,
      stepId: "pdf",
      moment: momentForStep(input.moments, "pdf") ?? momentForStep(input.moments, "open"),
      prompt: question.prompt,
      expertWords: spoken.words,
      offRecord: spoken.offRecord,
    });
  }

  return nodes;
}

export function captureReady(input: {
  screen: ScreenState;
  answers: Answer[];
}): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!input.screen.photos.plate || !input.screen.photos.install) {
    missing.push("data plate and finished install photos");
  }
  if (!input.screen.photos.discharge) missing.push("T&P discharge photo");
  if (input.screen.note.trim().length < 12) missing.push("a work note");
  if (!input.screen.pdfOpen) missing.push("the branded PDF preview");
  const answered = new Set(input.answers.filter((answer) => answer.phase === "capture").map((a) => a.id));
  if (!answered.has("q-photos")) missing.push("your words on the photos");
  if (!answered.has("q-note")) missing.push("your words on the note");
  if (!answered.has("q-discharge")) missing.push("your words on the discharge hold");
  return { ok: missing.length === 0, missing };
}

export function debriefTopicsMissing(answers: Answer[]): string[] {
  return DEBRIEF_QUESTIONS.filter(
    (question) => !answers.some((answer) => answer.id === question.id && answer.text.trim()),
  ).map((question) => question.id);
}
