import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/jev/route";
import { postSystemOne, resolveApiKey, reviewTicket } from "@/lib/jev/client";
import { JevParseError, parseSaveChoice } from "@/lib/jev/parse";
import {
  buildRequest,
  buildTicketState,
  decideSave,
  DEFAULT_MODEL,
  DEFAULT_URL,
  JEV_UNREACHABLE,
  withJevReason,
} from "@/lib/jev/ticket";
import { evaluateNewHire } from "@/lib/logic";
import type { TicketState } from "@/lib/jev/types";

function pike(overrides: Partial<TicketState> = {}): TicketState {
  return buildTicketState({
    job: "WO-2218",
    address: "90 Pike Street",
    unit: "Unit 4",
    equipment: "50-gal gas storage water heater",
    note: "Gas heater set. Discharge checked.",
    discharge: "uphill",
    hasPlate: true,
    hasInstall: true,
    pdfRequested: true,
    permitNumber: "ME-2218-04",
    permitType: "Mechanical — gas water heater",
    permitStatus: "Expired",
    ...overrides,
  });
}

function choiceBody(choice: "allow" | "hold", confidence = 0.86) {
  const probabilities =
    choice === "hold" ? { allow: 0.14, hold: 0.86 } : { allow: 0.86, hold: 0.14 };
  return {
    model: "jev-1.13.0",
    answers: {
      save: { type: "choice", choice, probabilities, confidence },
    },
    usage: { input_tokens: 180, output_tokens: 0 },
  };
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("missing key", () => {
  it("keeps the local GR-11 stop and does not call Jev", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      throw new Error("network");
    }) as typeof fetch;
    const state = pike();
    const jev = await reviewTicket(state, { apiKey: "", env: {}, fetchImpl });
    expect(called).toBe(false);
    expect(jev).toMatchObject({ configured: false, source: "local", choice: null, error: null });
    const local = evaluateNewHire({
      action: "save",
      note: "Gas heater set. Discharge checked.",
      discharge: "uphill",
      hasPlate: true,
    });
    const outcome = decideSave({ local, jev });
    expect(local).toEqual({ ok: false, reason: "uphill", code: "GR-11" });
    expect(outcome.save).toBe(false);
    expect(outcome.stoppedBy).toBe("local");
    expect(outcome.code).toBe("GR-11");
    expect(withJevReason("Stop. Don't save.", jev)).toBe("Stop. Don't save.");
  });
});

describe("present key", () => {
  it("posts an allow-or-hold choice and holds the save when Jev says hold", async () => {
    const seen: { url?: string; auth?: string; body?: unknown } = {};
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      seen.url = url;
      seen.auth = new Headers(init?.headers).get("Authorization") ?? "";
      seen.body = JSON.parse(String(init?.body));
      return jsonResponse(200, choiceBody("hold", 0.91));
    }) as typeof fetch;
    const state = pike({ note: "Call Jordan at (555) 019-4428 if the union weeps." });
    const jev = await reviewTicket(state, { apiKey: "test-key", env: {}, fetchImpl });
    expect(seen.url).toBe(DEFAULT_URL);
    expect(seen.auth).toBe("Bearer test-key");
    const body = seen.body as {
      model: string;
      state: TicketState & { blob?: string };
      questions: { save: { type: string; criteria: Record<string, string> } };
    };
    expect(body.model).toBe(DEFAULT_MODEL);
    expect(body.questions.save.type).toBe("choice");
    expect(Object.keys(body.questions.save.criteria)).toEqual(["allow", "hold"]);
    expect(body.state.permitStatus).toBe("Expired");
    expect(body.state.discharge).toBe("uphill");
    expect(body.state.noteHasPhone).toBe(true);
    expect(body.state.note).not.toContain("555");
    expect(JSON.stringify(body.state)).not.toMatch(/data:image|base64,|blob|bytes/);
    expect(JSON.stringify(body)).not.toContain("test-key");
    expect(jev.source).toBe("jev");
    expect(jev.choice).toBe("hold");
    expect(jev.reason).toMatch(/Jev chose hold/);
    expect(jev.reason).toMatch(/Do not save/);
    expect(jev.confidence).toBe(0.91);
    const local = evaluateNewHire({
      action: "save",
      note: state.note,
      discharge: "down",
      hasPlate: true,
    });
    const outcome = decideSave({ local, jev });
    expect(outcome.save).toBe(false);
    expect(outcome.stoppedBy).toBe("jev");
    expect(withJevReason("Stop. Nothing was sent.", jev)).toContain("Jev chose hold");
  });

  it("still stops the expired Pike Street ticket when Jev says allow", async () => {
    const fetchImpl = (async () => jsonResponse(200, choiceBody("allow", 0.8))) as typeof fetch;
    const jev = await reviewTicket(pike(), { apiKey: "test-key", env: {}, fetchImpl });
    const local = evaluateNewHire({
      action: "save",
      note: "Gas heater set. Discharge checked.",
      discharge: "uphill",
      hasPlate: true,
    });
    const outcome = decideSave({ local, jev });
    expect(jev.choice).toBe("allow");
    expect(outcome.save).toBe(false);
    expect(outcome.stoppedBy).toBe("local");
    expect(outcome.code).toBe("GR-11");
    expect(withJevReason("Leave it open. Nothing was sent.", jev)).toMatch(/Jev chose allow/);
  });

  it("allows a clean ticket when Jev says allow", async () => {
    const fetchImpl = (async () => jsonResponse(200, choiceBody("allow"))) as typeof fetch;
    const state = pike({ discharge: "down", permitStatus: "Issued" });
    const jev = await reviewTicket(state, { apiKey: "test-key", env: {}, fetchImpl });
    const local = evaluateNewHire({
      action: "save",
      note: "Gas heater set. Discharge checked.",
      discharge: "down",
      hasPlate: true,
    });
    const outcome = decideSave({ local, jev });
    expect(outcome.save).toBe(true);
    expect(outcome.stoppedBy).toBeNull();
    expect(withJevReason("That one can go.", jev)).toMatch(/Jev chose allow/);
  });

  it("falls back to the local stop when the call fails", async () => {
    const fetchImpl = (async () => jsonResponse(500, { detail: "nope" })) as typeof fetch;
    const jev = await reviewTicket(pike(), { apiKey: "test-key", env: {}, fetchImpl });
    expect(jev.source).toBe("local");
    expect(jev.error).toBe(JEV_UNREACHABLE);
    const outcome = decideSave({
      local: { ok: false, reason: "uphill", code: "GR-11" },
      jev,
    });
    expect(outcome.save).toBe(false);
    expect(outcome.code).toBe("GR-11");
    expect(withJevReason("Stop.", jev)).toContain(JEV_UNREACHABLE);
  });

  it("retries once on 429", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(429, { detail: "slow" }, { "retry-after-ms": "0" });
      return jsonResponse(200, choiceBody("hold"));
    }) as typeof fetch;
    const raw = await postSystemOne(buildRequest(pike()), {
      apiKey: "test-key",
      url: DEFAULT_URL,
      fetchImpl,
      timeoutMs: 1000,
    });
    expect(calls).toBe(2);
    expect(parseSaveChoice(raw).choice).toBe("hold");
  });
});

describe("parse", () => {
  it("rejects a choice outside allow and hold", () => {
    expect(() =>
      parseSaveChoice({
        model: "jev-1.13.0",
        answers: {
          save: {
            type: "choice",
            choice: "maybe",
            probabilities: { maybe: 1 },
            confidence: 0.4,
          },
        },
        usage: { input_tokens: 1, output_tokens: 0 },
      }),
    ).toThrow(JevParseError);
    expect(resolveApiKey({ JEV_API_KEY: "  abc  " })).toBe("abc");
    expect(resolveApiKey({})).toBe("");
  });
});

describe("route", () => {
  it("returns the local reading when the key is unset and rejects image bytes", async () => {
    const previous = process.env.JEV_API_KEY;
    delete process.env.JEV_API_KEY;
    try {
      const response = await POST(
        new Request("http://local/api/jev", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            state: {
              job: "WO-2218",
              address: "90 Pike Street",
              note: "Discharge runs uphill.",
              discharge: "uphill",
              hasPlate: true,
              pdfRequested: true,
            },
          }),
        }),
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { configured: boolean; source: string; choice: null };
      expect(body).toMatchObject({ configured: false, source: "local", choice: null });
      const rejected = await POST(
        new Request("http://local/api/jev", {
          method: "POST",
          body: JSON.stringify({
            state: { job: "WO-2218", address: "90 Pike Street", note: "data:image/png;base64,aaaa" },
          }),
        }),
      );
      expect(rejected.status).toBe(400);
    } finally {
      if (previous === undefined) delete process.env.JEV_API_KEY;
      else process.env.JEV_API_KEY = previous;
    }
  });
});
