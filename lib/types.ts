export type PhotoId = "plate" | "install" | "discharge";

export type ScreenState = {
  photos: Record<PhotoId, boolean>;
  note: string;
  pdfOpen: boolean;
  saved: boolean;
  held: boolean;
};

export type Job = {
  id: string;
  code: string;
  customer: string;
  address: string;
  unit: string;
  equipment: string;
  phone: string;
  filename: string;
  discharge: "down" | "uphill";
};

export type Answer = {
  id: string;
  phase: "capture" | "debrief" | "aside";
  topic: string;
  prompt: string;
  text: string;
  offRecord: boolean;
  at: number;
};

export type Moment = {
  id: string;
  stepId: string;
  label: string;
  screen: ScreenState;
  at: number;
};

export type TeachBackLine = {
  id: string;
  topic: string;
  text: string;
  sourceId: string | null;
  teachable: boolean;
};

export type Guardrail = {
  code: string;
  title: string;
  rule: string;
  topic: string;
};

export type MapNode = {
  id: string;
  kind: "step" | "guardrail";
  title: string;
  detail: string;
  stepId: string;
  guardrailCode?: string;
  moment: Moment | null;
  prompt: string | null;
  expertWords: string | null;
  offRecord: boolean;
};

export type BlockReason = "uphill" | "pii" | "missing-plate";

export type Stage = "intro" | "capture" | "debrief" | "map" | "teach";
