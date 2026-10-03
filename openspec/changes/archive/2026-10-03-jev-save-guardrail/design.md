# Design

## Context

`judgeSave` in the teach screen calls `evaluateNewHire`, then looks up the guardrail and searches permits. GR-11 blocks an uphill discharge before the PDF is sent. Permit search stays on Algolia (`public_permits`) and already cites ME-2218-04 at 90 Pike Street as Expired. Voice stays on ElevenLabs.

The jobproof client (`lib/jev/client.ts` in icohangar-ops/jobproof) posts `{ model, state, questions }` to `https://thejevai.com/v1/systemone` with `Authorization: Bearer`. A missing key or a bad key was checked against that host on 2026-10-03: a missing key is rejected, and a fake bearer returns 401 `Invalid API key`. Official TypeSafe documents the same JSON body at `https://api.typesafe.ai/v1/systemone`. This app follows the jobproof host because that client is still valid and it is the host documented for `JEV_API_KEY`.

## Goals / Non-Goals

**Goals:**

- One Choice question, `allow` versus `hold`, over written ticket fields, before a new-hire save or PDF send.
- GR-11, GR-07, and GR-04 remain hard stops even when Jev returns allow.
- The choice, its criterion sentence, and confidence show on the teach screen.
- No key and a failed call both fall through to the local path without throwing.

**Non-Goals:**

- Changing ElevenLabs session, speech, or agent tools.
- Replacing Algolia permit search or treating Jev as a vision model.
- Sending image bytes, customer phone digits, or a hardcoded API key.
- Using Score or Noul for this gate. Those types stay legal on the wire, but this save asks one Choice.

## Decisions

1. The browser posts ticket text to `POST /api/jev`. The route reads `JEV_API_KEY` and calls System One. The key is not returned and is not prefixed for the client bundle.
2. The request uses model `jev-1.13.0`, the pin in the verified jobproof client. Headers are `Authorization: Bearer <JEV_API_KEY>`, `Content-Type: application/json`, and `Accept: application/json`. One retry on HTTP 429 or 529, then the local path.
3. State is job code, address, unit, equipment, redacted note, a boolean that the note had a phone, discharge (`down` or `uphill`), plate and install flags, `pdfRequested`, and the permit number, type, and status already returned by permit search. Phone digits and `data:image` payloads are stripped. No photo bytes.
4. The question id is `save`. Criteria: `allow` means the written ticket can be saved and the PDF can be sent; `hold` means do not save and do not send the PDF. The visible reason is `Jev chose <choice>. <criterion sentence>` plus confidence when the answer includes it.
5. Order on **Save and send PDF**: evaluate the local rules, search permits (unchanged tool), call Jev with that written state, then combine. Local failure always stops the save. Jev `hold` stops the save when local rules would allow it. Jev `allow` plus a local pass saves. **Leave the job open** does not call Jev, because nothing is saved or sent.
6. A failed or unparseable Jev response sets `source` back to `local`, records a short error the screen can show, and lets the local verdict stand.

## Risks / Trade-offs

- [Hosted call sees the note and address] → Phone digits are redacted. The note is already fictional training text. The key stays on the server.
- [Jev allow on the Pike Street ticket] → GR-11 still stops the save, and the screen shows both the GR-11 stop and the allow reading.
- [thejevai.com and api.typesafe.ai are different hosts] → `JEV_API_KEY` matches the jobproof host that still answers 401 for a bad bearer. A TypeSafe-only key would fail closed to the local path rather than crash.
- [Demo without a key] → No network call. Today's block and allow copy stays.

## Migration Plan

Unset `JEV_API_KEY` keeps the current save path. Set the key in `.env` (gitignored) to turn the Choice call on. Rollback is removing the key.

## Open Questions

None. The endpoint and body were verified against the live host and the jobproof client.
