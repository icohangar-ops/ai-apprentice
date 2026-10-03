import type { ChoiceQuestion } from "@/lib/jev/types";

const CHOICE_MAX = 255;

export function choice(instructions: string, criteria: Record<string, string>): ChoiceQuestion {
  const count = Object.keys(criteria).length;
  if (count < 2 || count > CHOICE_MAX) {
    throw new Error(`Choice needs between 2 and ${CHOICE_MAX} options.`);
  }
  return { type: "choice", instructions, criteria };
}
