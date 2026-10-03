# Tasks

## 1. Jev client

- [x] 1.1 Add the System One client, ticket state, Choice question, and parser in `lib/jev`, and verify `lib/jev/jev.test.ts` covers a missing key (no network, local path) and a present key (allow and hold, request URL, bearer header, no image bytes).
- [x] 1.2 Add `POST /api/jev` so the key stays on the server, and verify a missing key returns the local reading without calling Jev.

## 2. Save path

- [x] 2.1 Call the review before **Save and send PDF**, keep GR-11/GR-07/GR-04 as hard stops, and verify the combine function still blocks the uphill Pike Street ticket when Jev returns allow.
- [x] 2.2 Show the Jev choice and reason on the teach screen, and verify the block or allow copy includes that reason when Jev answered.
- [x] 2.3 Put an empty `JEV_API_KEY` in `.env.example` and a short README note, and verify no key is hardcoded and `.env` is not added.
