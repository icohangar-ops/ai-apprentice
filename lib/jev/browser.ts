import { failedReading, isJevSaveReading } from "@/lib/jev/ticket";
import type { JevSaveReading, TicketState } from "@/lib/jev/types";

/** Ask the app server. The API key stays there. A failed call does not throw. */
export async function loadSaveReview(state: TicketState): Promise<JevSaveReading> {
  try {
    const response = await fetch("/api/jev", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ state }),
    });
    if (!response.ok) throw new Error(String(response.status));
    const body: unknown = await response.json();
    if (!isJevSaveReading(body)) throw new Error("shape");
    return body;
  } catch {
    return failedReading();
  }
}
