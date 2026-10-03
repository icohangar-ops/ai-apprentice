export type Discharge = "down" | "uphill";

export type SaveChoice = "allow" | "hold";

/** Written ticket fields only. Jev does not receive image bytes. */
export type TicketState = {
  job: string;
  address: string;
  unit: string;
  equipment: string;
  note: string;
  noteHasPhone: boolean;
  discharge: Discharge;
  hasPlate: boolean;
  hasInstall: boolean;
  pdfRequested: boolean;
  permitNumber: string;
  permitType: string;
  permitStatus: string;
};

export type ChoiceQuestion = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

export type SystemOneResponse = {
  model: string;
  answers: Record<string, { type: string }>;
  usage: { input_tokens: number; output_tokens: number };
};

export type JevSaveReading = {
  configured: boolean;
  source: "jev" | "local";
  choice: SaveChoice | null;
  reason: string | null;
  model: string | null;
  confidence: number | null;
  error: string | null;
};
