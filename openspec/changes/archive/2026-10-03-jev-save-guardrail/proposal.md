# Proposal

## Why

The new-hire save path already stops a wrong closeout with local rules, including GR-11 on the Pike Street ticket whose permit is expired. That stop is deterministic. A text decision from Jev (TypeSafe System One) should sit in front of the save so an allow-or-hold choice over the written ticket is visible before anything is filed or a PDF is sent.

## What Changes

- Before **Save and send PDF**, ask Jev one Choice question (`allow` or `hold`) about the written ticket. The call is text only. Photos are not sent.
- Show the Jev choice and its reason on the teach screen. A hold from Jev blocks the save. An allow does not override GR-11, GR-07, or GR-04.
- When `JEV_API_KEY` is unset, or the call fails, keep today's local guardrail path and do not crash.
- Leave ElevenLabs voice and Algolia permit search in place. The expired Pike Street hit is still cited by the existing search.

## Capabilities

### New Capabilities

- `save-guardrail`: The decision that runs before a new-hire ticket is saved or its closeout PDF is sent, including the local GR-11 stop and the optional Jev allow/hold reading.

### Modified Capabilities

- None. This project has no existing specs.

## Impact

- New server route `app/api/jev` and client `lib/jev`. The browser never sees `JEV_API_KEY`.
- Teach-screen save path in `components/apprentice-app.tsx` shows the Jev reason beside the existing block.
- `.env.example` gains an empty `JEV_API_KEY` placeholder. No key is committed.
- The HTTP call matches the jobproof System One client: `POST https://thejevai.com/v1/systemone` with `Authorization: Bearer`, `model`, `state`, and typed `questions`.
