"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CloseoutScreen } from "@/components/closeout-screen";
import { PermitSearch } from "@/components/permit-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useVoice, VoiceProvider } from "@/components/voice-provider";
import { lookupGuardrail } from "@/lib/guardrails";
import { CAPTURE_JOB, emptyScreen, SAMPLE_NOTE, TEACH_JOB } from "@/lib/jobs";
import {
  answerSideQuestion,
  buildTeachBack,
  buildWorkMap,
  captureReady,
  explainBlock,
  explainHold,
  evaluateNewHire,
  onRecordBrief,
} from "@/lib/logic";
import {
  CAPTURE_QUESTIONS,
  DEBRIEF_QUESTIONS,
  nextCaptureQuestion,
  OFF_RECORD_SAMPLE,
  type ScriptQuestion,
} from "@/lib/script";
import type { Answer, Moment, PhotoId, ScreenState, Stage, TeachBackLine } from "@/lib/types";

const STORAGE_KEY = "northline-apprentice-v1";

type BlockState = { spoken: string; code: string } | null;

export function ApprenticeApp() {
  return (
    <ConversationProvider>
      <VoiceProvider>
        <Shell />
      </VoiceProvider>
    </ConversationProvider>
  );
}

function Shell() {
  const voice = useVoice();
  const [hydrated, setHydrated] = useState(false);
  const [stage, setStage] = useState<Stage>("intro");
  const [expertName, setExpertName] = useState("Alex");
  const [screen, setScreen] = useState<ScreenState>(emptyScreen);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [debriefIndex, setDebriefIndex] = useState(0);
  const [aside, setAside] = useState("");
  const [lineEdits, setLineEdits] = useState<Record<string, string>>({});
  const [teachConfirmed, setTeachConfirmed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [teachScreen, setTeachScreen] = useState<ScreenState>({
    photos: { plate: true, install: true, discharge: true },
    note: "",
    pdfOpen: false,
    saved: false,
    held: false,
  });
  const [block, setBlock] = useState<BlockState>(null);
  const [sideAnswer, setSideAnswer] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const firedRef = useRef<string | null>(null);
  const cueRef = useRef(voice.cue);
  const typingTimer = useRef<number | null>(null);
  const debriefCued = useRef<string | null>(null);
  cueRef.current = voice.cue;

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as Partial<{
          stage: Stage;
          expertName: string;
          screen: ScreenState;
          moments: Moment[];
          answers: Answer[];
          askedIds: string[];
          debriefIndex: number;
          aside: string;
          lineEdits: Record<string, string>;
          teachConfirmed: boolean;
          teachScreen: ScreenState;
        }>;
        if (saved.stage) setStage(saved.stage);
        if (saved.expertName) setExpertName(saved.expertName);
        if (saved.screen) setScreen(saved.screen);
        if (saved.moments) setMoments(saved.moments);
        if (saved.answers) setAnswers(saved.answers);
        if (typeof saved.debriefIndex === "number") setDebriefIndex(saved.debriefIndex);
        if (typeof saved.aside === "string") setAside(saved.aside);
        if (saved.lineEdits) setLineEdits(saved.lineEdits);
        if (saved.teachConfirmed) setTeachConfirmed(true);
        if (saved.teachScreen) setTeachScreen(saved.teachScreen);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stage,
        expertName,
        screen,
        moments,
        answers,
        debriefIndex,
        aside,
        lineEdits,
        teachConfirmed,
        teachScreen,
      }),
    );
  }, [
    hydrated,
    stage,
    expertName,
    screen,
    moments,
    answers,
    debriefIndex,
    aside,
    lineEdits,
    teachConfirmed,
    teachScreen,
  ]);

  useEffect(() => {
    if (!voice.lastUserText || !activeQuestionId) return;
    setDraft(voice.lastUserText.text);
  }, [voice.lastUserText, activeQuestionId]);

  const name = expertName.trim() || "Alex";
  const answeredCapture = answers.filter((answer) => answer.phase === "capture").map((answer) => answer.id);
  const pending =
    stage === "capture" && !activeQuestionId ? nextCaptureQuestion(screen, answeredCapture) : null;
  const activeQuestion = CAPTURE_QUESTIONS.find((question) => question.id === activeQuestionId) ?? null;

  function remember(stepId: string, label: string, nextScreen: ScreenState) {
    setMoments((prev) => {
      const moment: Moment = {
        id: `m-${stepId}`,
        stepId,
        label,
        screen: structuredClone(nextScreen),
        at: Date.now(),
      };
      const index = prev.findIndex((item) => item.stepId === stepId);
      if (index === -1) return [...prev, moment];
      const copy = [...prev];
      copy[index] = moment;
      return copy;
    });
  }

  function markTyping() {
    setTyping(true);
    voice.activity();
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => setTyping(false), 900);
  }

  function fire(question: ScriptQuestion) {
    if (firedRef.current === question.id) return;
    if (answers.some((answer) => answer.id === question.id)) return;
    firedRef.current = question.id;
    setActiveQuestionId(question.id);
    setDraft("");
    cueRef.current(question.prompt);
  }

  useEffect(() => {
    if (stage !== "capture" || !pending) return;
    if (typing || voice.talking || voice.speaking) return;
    const handle = window.setTimeout(() => fire(pending), 1400);
    return () => window.clearTimeout(handle);
    // fire is stable enough via refs; pending id is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, pending?.id, typing, voice.talking, voice.speaking]);

  useEffect(() => {
    if (stage !== "debrief") return;
    const question = DEBRIEF_QUESTIONS[debriefIndex];
    if (!question || debriefCued.current === question.id) return;
    if (answers.some((answer) => answer.id === question.id)) return;
    debriefCued.current = question.id;
    cueRef.current(question.prompt);
  }, [stage, debriefIndex, answers]);

  function keep(question: ScriptQuestion, text: string, offRecord = false) {
    const clean = text.trim();
    if (!clean) return;
    setAnswers((prev) => [
      ...prev.filter((answer) => answer.id !== question.id),
      {
        id: question.id,
        phase: question.phase,
        topic: question.topic,
        prompt: question.prompt,
        text: clean,
        offRecord,
        at: Date.now(),
      },
    ]);
    if (question.phase === "capture") {
      firedRef.current = null;
      setActiveQuestionId(null);
      setDraft("");
    } else {
      setDraft("");
      setDebriefIndex((index) => index + 1);
    }
  }

  function toggleOff(id: string) {
    setAnswers((prev) =>
      prev.map((answer) => (answer.id === id ? { ...answer, offRecord: !answer.offRecord } : answer)),
    );
  }

  async function startCapture() {
    setStarting(true);
    const fresh = emptyScreen();
    setScreen(fresh);
    setMoments([]);
    setAnswers([]);
    firedRef.current = null;
    debriefCued.current = null;
    setActiveQuestionId(null);
    setDraft("");
    setAside("");
    setDebriefIndex(0);
    setTeachConfirmed(false);
    setLineEdits({});
    setBlock(null);
    setSideAnswer(null);
    remember("open", "Ticket opened", fresh);
    await voice.connect("field");
    setStage("capture");
    setStarting(false);
  }

  function addPhoto(id: PhotoId) {
    const label = id === "plate" ? "Data plate" : id === "install" ? "Finished install" : "T&P discharge";
    setScreen((current) => {
      const next = { ...current, photos: { ...current.photos, [id]: true } };
      queueMicrotask(() => remember(id, label, next));
      return next;
    });
  }

  function updateNote(value: string) {
    const next = { ...screen, note: value };
    setScreen(next);
    if (value.trim().length >= 12) remember("note", "Work note", next);
  }

  function openPdf() {
    const next = { ...screen, pdfOpen: true };
    setScreen(next);
    remember("pdf", "Branded PDF", next);
  }

  const ready = captureReady({ screen, answers });
  const generatedLines = useMemo(() => buildTeachBack(answers, name), [answers, name]);
  const lines: TeachBackLine[] = generatedLines.map((line) => {
    if (!line.teachable || lineEdits[line.id] === undefined) return line;
    return { ...line, text: lineEdits[line.id] };
  });
  const nodes = useMemo(() => buildWorkMap({ moments, answers }), [moments, answers]);
  const selected = nodes.find((node) => node.id === selectedNodeId) ?? nodes[0] ?? null;
  const heldCount = answers.filter((answer) => answer.offRecord && answer.text.trim()).length;
  const debriefQuestion = DEBRIEF_QUESTIONS[debriefIndex] ?? null;
  const debriefDone = DEBRIEF_QUESTIONS.every((question) =>
    answers.some((answer) => answer.id === question.id && answer.text.trim()),
  );

  const quietLabel = typing
    ? "Staying quiet — you're typing."
    : voice.talking
      ? "Staying quiet — you're talking."
      : voice.speaking
        ? "Speaking."
        : activeQuestion
          ? "Listening for your answer."
          : pending
            ? "Waiting for a pause, then I'll ask."
            : "Watching.";

  async function confirmTeachBack() {
    setTeachConfirmed(true);
    setStage("map");
    if (!selectedNodeId && nodes[0]) setSelectedNodeId(nodes[0].id);
  }

  async function startTeach() {
    const brief = onRecordBrief(lines, name);
    setBlock(null);
    setSideAnswer(null);
    setTeachScreen({
      photos: { plate: true, install: true, discharge: true },
      note: "",
      pdfOpen: false,
      saved: false,
      held: false,
    });
    setStage("teach");
    voice.disconnect();
    await voice.connect("teach", brief);
  }

  async function judgeSave(action: "save" | "hold") {
    const verdict = evaluateNewHire({
      action,
      note: teachScreen.note,
      discharge: TEACH_JOB.discharge,
      hasPlate: teachScreen.photos.plate,
    });
    if (!verdict.ok) {
      const payload = await voice.lookup(verdict.code, "tutor");
      const permit = await voice.searchPermits(TEACH_JOB.address, "tutor");
      const permitLine = permit.spoken ? ` ${permit.spoken}` : "";
      const spoken = `${explainBlock({
        reason: verdict.reason,
        code: verdict.code,
        expertName: name,
        answers,
        guardrail: payload.result
          ? {
              code: payload.result.code ?? verdict.code,
              title: payload.result.title ?? "",
              rule: payload.result.rule ?? "",
              topic: verdict.reason,
            }
          : lookupGuardrail(verdict.code),
        lines,
      })}${permitLine}`;
      setBlock({ spoken, code: verdict.code });
      setTeachScreen((prev) => ({ ...prev, saved: false }));
      voice.cue(spoken);
      return;
    }
    setBlock(null);
    if (action === "hold") {
      setTeachScreen((prev) => ({ ...prev, held: true, saved: false }));
      voice.cue(explainHold(name, answers));
      return;
    }
    setTeachScreen((prev) => ({ ...prev, saved: true, pdfOpen: true }));
    voice.cue("That one can go. The discharge is acceptable, the plate is there, and the note has no phone number.");
  }

  function askSide() {
    const reply = answerSideQuestion({
      question: "Can I text the PDF from my personal phone?",
      answers,
      expertName: name,
    });
    setSideAnswer(reply.spoken);
    voice.cue(reply.spoken);
  }

  function reset() {
    voice.disconnect();
    window.localStorage.removeItem(STORAGE_KEY);
    firedRef.current = null;
    debriefCued.current = null;
    setStage("intro");
    setExpertName("Alex");
    setScreen(emptyScreen());
    setMoments([]);
    setAnswers([]);
    setActiveQuestionId(null);
    setDraft("");
    setDebriefIndex(0);
    setAside("");
    setLineEdits({});
    setTeachConfirmed(false);
    setSelectedNodeId(null);
    setBlock(null);
    setSideAnswer(null);
    setTeachScreen({
      photos: { plate: true, install: true, discharge: true },
      note: "",
      pdfOpen: false,
      saved: false,
      held: false,
    });
  }

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Northline Apprentice</p>
            <h1 className="font-serif text-3xl leading-tight sm:text-4xl">Watch a closeout. Teach the next hire.</h1>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Badge variant={voice.mode === "demo" ? "stamp" : voice.live ? "pine" : "signal"}>
              {voice.statusLabel}
            </Badge>
            <button type="button" className="text-xs text-muted underline-offset-2 hover:underline" onClick={reset}>
              Reset this session
            </button>
          </div>
        </header>
        <p className="rounded-lg border border-line bg-card px-3 py-2 text-sm leading-relaxed">
          Training aid, not a compliance system. It does not certify that a job was done safely. Names,
          addresses, and phone numbers on the screen are fictional.
        </p>
        <Progress stage={stage} />
        {voice.error ? (
          <p className="rounded-lg border border-stamp/30 bg-stamp/5 px-3 py-2 text-sm text-stamp">{voice.error}</p>
        ) : null}

        {stage === "intro" ? (
          <Intro
            name={expertName}
            onName={setExpertName}
            starting={starting}
            onStart={() => void startCapture()}
          />
        ) : null}

        {stage === "capture" ? (
          <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
            <CloseoutScreen
              job={CAPTURE_JOB}
              screen={screen}
              interactive
              shared
              onAddPhoto={addPhoto}
              onNote={updateNote}
              onNoteActivity={markTyping}
              onInsertNote={() => {
                markTyping();
                updateNote(SAMPLE_NOTE);
              }}
              onOpenPdf={openPdf}
            />
            <ApprenticePanel
              quietLabel={quietLabel}
              caption={voice.caption}
              live={voice.live}
              onActivity={markTyping}
              onTalking={voice.noteTalking}
            >
              {activeQuestion ? (
                <QuestionCard
                  kicker="Asked at a pause"
                  prompt={activeQuestion.prompt}
                  draft={draft}
                  onDraft={(value) => {
                    markTyping();
                    setDraft(value);
                  }}
                  onKeep={() => keep(activeQuestion, draft)}
                  onSample={() => keep(activeQuestion, activeQuestion.sample)}
                  guardrail={activeQuestion.guardrailCode}
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <p>{pending ? "A question is armed. Pause, or ask now if you are already still." : "Keep going on the screen. I'll ask when you pause."}</p>
                  <Button
                    variant="signal"
                    disabled={!pending || typing || voice.talking || voice.speaking}
                    onClick={() => pending && fire(pending)}
                  >
                    Ask now
                  </Button>
                  {!ready.ok ? (
                    <p className="text-muted">Still needed: {ready.missing.join(", ")}.</p>
                  ) : null}
                </div>
              )}
              <Button className="mt-4 w-full" disabled={!ready.ok || Boolean(activeQuestion) || Boolean(pending)} onClick={() => setStage("debrief")}>
                Continue to the debrief
              </Button>
            </ApprenticePanel>
          </section>
        ) : null}

        {stage === "debrief" ? (
          <section className="grid items-start gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="font-serif text-2xl">Three things you did not say on the job</h2>
              <p className="text-sm text-muted">
                These were not asked while you were in the closeout. Answer them, then confirm the teach-back.
              </p>
              {debriefQuestion ? (
                <QuestionCard
                  kicker={`Follow-up ${debriefIndex + 1} of ${DEBRIEF_QUESTIONS.length}`}
                  prompt={debriefQuestion.prompt}
                  draft={draft}
                  onDraft={(value) => {
                    markTyping();
                    setDraft(value);
                  }}
                  onKeep={() => keep(debriefQuestion, draft)}
                  onSample={() => keep(debriefQuestion, debriefQuestion.sample)}
                />
              ) : null}
              {debriefDone ? (
                <div className="space-y-4 rounded-xl border border-line bg-card p-4">
                  <h3 className="font-serif text-xl">Teach-back</h3>
                  <p className="text-sm">
                    This is what I will teach. Edit any line, mark something off the record, then confirm.
                  </p>
                  <AnswerToggles answers={answers} onToggle={toggleOff} />
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Optional aside the tutor must not hear</p>
                    <Textarea
                      value={aside}
                      placeholder="A shortcut you do not want taught."
                      onChange={(event) => setAside(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setAside(OFF_RECORD_SAMPLE);
                          setAnswers((prev) => [
                            ...prev.filter((answer) => answer.id !== "aside"),
                            {
                              id: "aside",
                              phase: "aside",
                              topic: "private-phone",
                              prompt: "Off the record",
                              text: OFF_RECORD_SAMPLE,
                              offRecord: true,
                              at: Date.now(),
                            },
                          ]);
                        }}
                      >
                        Hold a sample aside off the record
                      </Button>
                    </div>
                  </div>
                  <ol className="space-y-3">
                    {lines.map((line) => (
                      <li key={line.id} className="space-y-1">
                        <Textarea
                          value={line.text}
                          disabled={!line.teachable}
                          onChange={(event) =>
                            setLineEdits((prev) => ({ ...prev, [line.id]: event.target.value }))
                          }
                        />
                      </li>
                    ))}
                  </ol>
                  <Button variant="signal" onClick={() => void confirmTeachBack()}>
                    Confirm the teach-back
                  </Button>
                </div>
              ) : null}
            </div>
            <ApprenticePanel quietLabel={voice.speaking ? "Speaking." : "In the debrief."} caption={voice.caption} live={voice.live} onActivity={markTyping} onTalking={voice.noteTalking}>
              <p className="text-sm text-muted">
                I will read the teach-back back to you after you confirm it on the work map. Off-the-record lines stay out of the tutor.
              </p>
              <PermitSearch initialQuery="418 Harbor Lane" caller="debrief" />
            </ApprenticePanel>
          </section>
        ) : null}

        {stage === "map" ? (
          <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <h2 className="font-serif text-2xl">Work map</h2>
              <p className="text-sm text-muted">
                Every step and guardrail opens the screen moment and {name}&apos;s words.
                {teachConfirmed ? " Teach-back confirmed." : " Confirm happened before this map."}
              </p>
              <ol className="space-y-2">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNodeId(node.id);
                        setShowHeld(false);
                      }}
                      className={`w-full rounded-lg border px-3 py-2 text-left ${
                        selected?.id === node.id ? "border-signal bg-card" : "border-line bg-card/60"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{node.title}</span>
                        <Badge variant={node.kind === "guardrail" ? "stamp" : "outline"}>
                          {node.offRecord ? "Off record" : node.kind === "guardrail" ? "Guardrail" : "Step"}
                        </Badge>
                      </span>
                      <span className="mt-1 block text-xs text-muted">{node.detail}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Button variant="signal" onClick={() => void startTeach()}>
                Coach a new hire on a different job
              </Button>
            </div>
            <div className="space-y-3">
              {selected ? (
                <>
                  <CloseoutScreen
                    job={CAPTURE_JOB}
                    screen={selected.moment?.screen ?? screen}
                    interactive={false}
                  />
                  <div className="rounded-xl border border-line bg-card p-4">
                    <p className="text-xs uppercase tracking-wide text-muted">
                      {selected.moment ? selected.moment.label : "No screen moment captured"}
                    </p>
                    {selected.prompt ? <p className="mt-2 text-sm">Apprentice: {selected.prompt}</p> : null}
                    {selected.offRecord ? (
                      <div className="mt-3 space-y-2">
                        <p className="text-sm text-stamp">
                          Off the record. The tutor cannot see this wording.
                        </p>
                        <Button size="sm" variant="outline" onClick={() => setShowHeld((value) => !value)}>
                          {showHeld ? "Hide the held wording" : "Show the held wording"}
                        </Button>
                        {showHeld ? (
                          <p className="text-sm">
                            {
                              answers.find(
                                (answer) => answer.offRecord && answer.prompt === selected.prompt,
                              )?.text
                            }
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 font-serif text-lg leading-snug">
                        {selected.expertWords
                          ? `${name}: “${selected.expertWords}”`
                          : `${name} did not leave words on this step.`}
                      </p>
                    )}
                    {selected.guardrailCode ? (
                      <p className="mt-3 text-sm text-muted">{lookupGuardrail(selected.guardrailCode)?.rule}</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-sm">The map fills in as the closeout is captured.</p>
              )}
            </div>
          </section>
        ) : null}

        {stage === "teach" ? (
          <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
            <div className="space-y-3">
              <div className="rounded-lg border border-signal/40 bg-signal/10 px-3 py-2 text-sm">
                New case. {name} never closed WO-2218. Jordan Hale, 90 Pike Street, gas heater. The
                discharge line in the photo runs uphill.
              </div>
              <CloseoutScreen
                job={TEACH_JOB}
                screen={teachScreen}
                interactive
                onNote={(value) => {
                  markTyping();
                  setTeachScreen((prev) => ({ ...prev, note: value }));
                }}
                onNoteActivity={markTyping}
                onOpenPdf={() => setTeachScreen((prev) => ({ ...prev, pdfOpen: true }))}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="stamp" onClick={() => void judgeSave("save")}>
                  Save and send PDF
                </Button>
                <Button variant="pine" onClick={() => void judgeSave("hold")}>
                  Leave the job open
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setTeachScreen((prev) => ({
                      ...prev,
                      note: `Customer asked for a callback at ${TEACH_JOB.phone}.`,
                    }))
                  }
                >
                  Paste the customer phone into the note
                </Button>
              </div>
              {teachScreen.saved ? (
                <p className="text-sm text-pine">Saved. The tutor let this one through.</p>
              ) : null}
              {teachScreen.held ? (
                <p className="text-sm text-pine">Left open. Nothing was sent.</p>
              ) : null}
              {block ? (
                <div className="rounded-xl border border-stamp/40 bg-card p-4">
                  <p className="text-xs uppercase tracking-wide text-stamp">Not saved · {block.code}</p>
                  <p className="mt-2 text-sm leading-relaxed">{block.spoken}</p>
                </div>
              ) : null}
            </div>
            <ApprenticePanel
              quietLabel={voice.speaking ? "Speaking." : typing ? "Staying quiet — you're typing." : "Tutoring."}
              caption={voice.caption || "I'll stop a save the expert would not make."}
              live={voice.live}
              onActivity={markTyping}
              onTalking={voice.noteTalking}
            >
              <p className="text-sm">
                On record for the tutor: {lines.filter((line) => line.teachable).length} confirmed lines.
                {heldCount > 0 ? ` ${heldCount} held off the record and not shown here.` : " Nothing is held off the record."}
              </p>
              <Button variant="outline" onClick={askSide}>
                Ask: can I text the PDF from my personal phone?
              </Button>
              {sideAnswer ? <p className="text-sm leading-relaxed">{sideAnswer}</p> : null}
              <PermitSearch initialQuery="90 Pike Street" caller="tutor" />
              <ToolList traces={voice.toolTraces} />
            </ApprenticePanel>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Progress({ stage }: { stage: Stage }) {
  const steps: { id: Stage | "debrief"; label: string }[] = [
    { id: "capture", label: "Capture" },
    { id: "debrief", label: "Debrief" },
    { id: "map", label: "Work map" },
    { id: "teach", label: "Teach" },
  ];
  return (
    <ol className="flex flex-wrap gap-2 text-sm">
      {steps.map((step) => {
        const current = stage === step.id || (stage === "intro" && step.id === "capture");
        return (
          <li
            key={step.id}
            className={`rounded-full px-3 py-1 ${current ? "bg-ink text-paper" : "bg-card text-muted"}`}
          >
            {step.label}
          </li>
        );
      })}
    </ol>
  );
}

function Intro({
  name,
  onName,
  starting,
  onStart,
}: {
  name: string;
  onName: (value: string) => void;
  starting: boolean;
  onStart: () => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
      <div className="space-y-4">
        <p className="max-w-xl text-base leading-relaxed">
          You are closing a water-heater job on a simulated screen: photos, a work note, and a branded
          PDF. The apprentice listens with ElevenLabs, stays quiet while you type or talk, and asks at
          the pauses — including what you do when a guardrail fails.
        </p>
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          <li>Capture the Harbor Lane closeout and answer in your own words, or use a sample.</li>
          <li>Debrief three things the closeout never asked, confirm the teach-back, and open the map.</li>
          <li>On a new gas-heater ticket, try to save. The tutor should stop you and say why.</li>
        </ol>
        <label className="block max-w-xs space-y-1 text-sm">
          <span>What should the apprentice call you?</span>
          <Input value={name} onChange={(event) => onName(event.target.value)} maxLength={40} />
        </label>
        <Button variant="signal" size="lg" disabled={starting} onClick={onStart}>
          {starting ? "Starting the agent…" : "Start the closeout"}
        </Button>
        <p className="text-xs text-muted">
          Allow the microphone if the browser asks. Typing an answer works if you would rather not talk.
          The live agent uses Scribe to listen.
        </p>
      </div>
      <CloseoutScreen job={CAPTURE_JOB} screen={emptyScreen()} interactive={false} shared />
    </section>
  );
}

function ApprenticePanel({
  quietLabel,
  caption,
  live,
  onActivity,
  onTalking,
  children,
}: {
  quietLabel: string;
  caption: string;
  live: boolean;
  onActivity: () => void;
  onTalking: (active: boolean) => void;
  children: ReactNode;
}) {
  return (
    <aside className="space-y-4 rounded-2xl border border-line bg-card p-4 lg:sticky lg:top-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-xl">Apprentice</p>
        <Badge variant={live ? "pine" : "outline"}>{live ? "Live" : "Voice"}</Badge>
      </div>
      <p className="text-sm font-medium text-signal">{quietLabel}</p>
      <blockquote className="border-l-2 border-signal pl-3 font-serif text-lg leading-snug">
        {caption || "I'll wait until you pause."}
      </blockquote>
      <TalkButton onActivity={onActivity} onTalking={onTalking} />
      {children}
    </aside>
  );
}

function TalkButton({
  onActivity,
  onTalking,
}: {
  onActivity: () => void;
  onTalking: (active: boolean) => void;
}) {
  return (
    <Button
      variant="outline"
      onPointerDown={() => onTalking(true)}
      onPointerUp={() => onTalking(false)}
      onPointerLeave={() => onTalking(false)}
      onKeyDown={() => {
        onTalking(true);
        onActivity();
      }}
      onKeyUp={() => onTalking(false)}
    >
      Hold while you talk
    </Button>
  );
}

function QuestionCard({
  kicker,
  prompt,
  draft,
  onDraft,
  onKeep,
  onSample,
  guardrail,
}: {
  kicker: string;
  prompt: string;
  draft: string;
  onDraft: (value: string) => void;
  onKeep: () => void;
  onSample: () => void;
  guardrail?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs uppercase tracking-wide text-muted">
        {kicker}
        {guardrail ? ` · ${guardrail}` : ""}
      </p>
      <p className="text-sm leading-relaxed">{prompt}</p>
      <Textarea
        value={draft}
        placeholder="Your words, or use the sample."
        onChange={(event) => onDraft(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="signal" disabled={!draft.trim()} onClick={onKeep}>
          Keep my words
        </Button>
        <Button variant="outline" onClick={onSample}>
          Use the sample answer
        </Button>
      </div>
    </div>
  );
}

function AnswerToggles({
  answers,
  onToggle,
}: {
  answers: Answer[];
  onToggle: (id: string) => void;
}) {
  const visible = answers.filter((answer) => answer.phase !== "aside");
  if (visible.length === 0) return null;
  return (
    <ul className="space-y-2">
      {visible.map((answer) => (
        <li key={answer.id} className="flex items-start justify-between gap-3 text-sm">
          <span className={answer.offRecord ? "text-muted line-through" : ""}>{answer.text}</span>
          <Button size="sm" variant={answer.offRecord ? "stamp" : "ghost"} onClick={() => onToggle(answer.id)}>
            {answer.offRecord ? "Off record" : "On record"}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ToolList({
  traces,
}: {
  traces: { id: string; tool: string; code: string; source: string; rule: string | null; error: string | null }[];
}) {
  if (traces.length === 0) {
    return (
      <p className="text-xs text-muted">
        Guardrail lookups and permit searches show up here. A blocked save looks up the rule and cites the permit hit before anything is sent.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {traces.map((trace) => (
        <li key={trace.id} className="rounded-md border border-line bg-paper px-3 py-2 text-xs">
          <p className="font-mono">
            {trace.tool}({trace.code}) · {trace.source}
          </p>
          <p className="mt-1 leading-relaxed">{trace.rule ?? trace.error}</p>
        </li>
      ))}
    </ul>
  );
}
