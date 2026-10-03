import { describe, expect, it } from "vitest";
import { CAPTURE_QUESTIONS, DEBRIEF_QUESTIONS, nextCaptureQuestion } from "./script";
import {
  answerSideQuestion,
  buildTeachBack,
  buildWorkMap,
  evaluateNewHire,
  explainBlock,
  noteHasPersonalPhone,
  publicAnswers,
  shouldAsk,
} from "./logic";
import { lookupGuardrail } from "./guardrails";
import { emptyScreen } from "./jobs";
import type { Answer, Moment } from "./types";

function answer(partial: Partial<Answer> & Pick<Answer, "id" | "topic" | "text">): Answer {
  return {
    phase: "capture",
    prompt: "Question",
    offRecord: false,
    at: 1,
    ...partial,
  };
}

describe("pause gate", () => {
  it("stays quiet while typing or talking", () => {
    expect(
      shouldAsk({ pending: true, typing: true, talking: false, speaking: false, idleMs: 5000 }),
    ).toBe(false);
    expect(
      shouldAsk({ pending: true, typing: false, talking: true, speaking: false, idleMs: 5000 }),
    ).toBe(false);
    expect(
      shouldAsk({ pending: true, typing: false, talking: false, speaking: true, idleMs: 5000 }),
    ).toBe(false);
  });

  it("asks only after a real pause", () => {
    expect(
      shouldAsk({ pending: true, typing: false, talking: false, speaking: false, idleMs: 400 }),
    ).toBe(false);
    expect(
      shouldAsk({ pending: true, typing: false, talking: false, speaking: false, idleMs: 1400 }),
    ).toBe(true);
  });
});

describe("capture questions", () => {
  it("asks a guardrail question and keeps debrief topics distinct", () => {
    const guardrailQuestions = CAPTURE_QUESTIONS.filter((question) => question.guardrailCode);
    expect(guardrailQuestions.length).toBeGreaterThanOrEqual(1);
    const captureTopics = new Set(CAPTURE_QUESTIONS.map((question) => question.topic));
    for (const question of DEBRIEF_QUESTIONS) {
      expect(captureTopics.has(question.topic)).toBe(false);
    }
    expect(DEBRIEF_QUESTIONS.length).toBeGreaterThanOrEqual(3);
  });

  it("waits for the screen moment before arming a question", () => {
    const screen = emptyScreen();
    expect(nextCaptureQuestion(screen, [])?.id).toBe("q-open");
    expect(nextCaptureQuestion(screen, ["q-open"])).toBeNull();
    screen.photos.plate = true;
    screen.photos.install = true;
    expect(nextCaptureQuestion(screen, ["q-open"])?.id).toBe("q-photos");
  });
});

describe("off record", () => {
  const secret = "If Closeout crashes I sometimes text the dispatcher a photo from my personal phone.";
  const answers: Answer[] = [
    answer({
      id: "q-discharge",
      topic: "discharge",
      text: "If it runs uphill I leave the job open.",
    }),
    answer({
      id: "aside",
      phase: "aside",
      topic: "private-phone",
      text: secret,
      offRecord: true,
    }),
  ];

  it("drops off-record lines from the tutor brief", () => {
    expect(publicAnswers(answers).map((item) => item.id)).toEqual(["q-discharge"]);
    const lines = buildTeachBack(answers, "Alex");
    const joined = lines.map((line) => line.text).join(" ");
    expect(joined).not.toContain("personal phone");
    expect(joined).toContain("leave the job open");
  });

  it("does not speak the off-record workaround when asked", () => {
    const reply = answerSideQuestion({
      question: "Can I text the PDF from my personal phone?",
      answers,
      expertName: "Alex",
    });
    expect(reply.leaked).toBe(false);
    expect(reply.spoken).not.toContain(secret);
    expect(reply.spoken).not.toContain("Closeout crashes");
    expect(reply.spoken).toContain("GR-02");
  });

  it("hides an off-record discharge quote from the block explanation", () => {
    const hidden: Answer[] = [
      answer({
        id: "q-discharge",
        topic: "discharge",
        text: "Secret van workaround: text the office a photo and close it anyway.",
        offRecord: true,
      }),
    ];
    const spoken = explainBlock({
      reason: "uphill",
      code: "GR-11",
      expertName: "Alex",
      answers: hidden,
      guardrail: lookupGuardrail("GR-11"),
    });
    expect(spoken).not.toContain("Secret van workaround");
    expect(spoken).toContain("off the record");
    expect(spoken).toContain("GR-11");
  });
});

describe("new hire save", () => {
  it("blocks an uphill discharge before save", () => {
    const result = evaluateNewHire({
      action: "save",
      note: "Gas heater set. Discharge checked.",
      discharge: "uphill",
      hasPlate: true,
    });
    expect(result).toEqual({ ok: false, reason: "uphill", code: "GR-11" });
  });

  it("blocks a phone number in the note", () => {
    expect(noteHasPersonalPhone("Call Jordan at (555) 019-4428 if needed")).toBe(true);
    const result = evaluateNewHire({
      action: "save",
      note: "Customer phone (555) 019-4428",
      discharge: "down",
      hasPlate: true,
    });
    expect(result).toEqual({ ok: false, reason: "pii", code: "GR-07" });
  });

  it("accepts leaving the uphill job open", () => {
    const result = evaluateNewHire({
      action: "hold",
      note: "T&P runs uphill. Left open for the office.",
      discharge: "uphill",
      hasPlate: true,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("work map", () => {
  it("links every closeout step and guardrail to a screen moment", () => {
    const screen = emptyScreen();
    screen.photos = { plate: true, install: true, discharge: true };
    screen.note = "Did the work.";
    screen.pdfOpen = true;
    const moments: Moment[] = ["open", "plate", "install", "discharge", "note", "pdf"].map(
      (stepId, index) => ({
        id: `m-${stepId}`,
        stepId,
        label: stepId,
        screen,
        at: index,
      }),
    );
    const answers = [
      answer({ id: "q-open", topic: "open", text: "Prove the unit and the discharge." }),
      answer({ id: "q-photos", topic: "photos", text: "Plate and finished install." }),
      answer({ id: "q-note", topic: "note", text: "No phone numbers in the note." }),
      answer({ id: "q-discharge", topic: "discharge", text: "Uphill means I do not close." }),
      answer({ id: "q-pdf", topic: "pdf", text: "Branded PDF with the job number." }),
    ];
    const nodes = buildWorkMap({ moments, answers });
    const steps = nodes.filter((node) => node.kind === "step" && node.title !== "Debrief");
    const guards = nodes.filter((node) => node.kind === "guardrail");
    expect(steps).toHaveLength(6);
    expect(guards.length).toBeGreaterThanOrEqual(4);
    for (const node of [...steps, ...guards]) {
      expect(node.moment).not.toBeNull();
      expect(node.expertWords).toBeTruthy();
    }
  });
});
