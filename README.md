# Northline Apprentice

A voice apprentice for field-ops closeout. An expert closes a fictional water-heater job on a simulated screen. The apprentice asks at natural pauses, builds a work map from the expert's own words, then coaches a new hire on a different job and stops a bad save.

This is a **training aid, not a compliance system**. It does not certify that work was done safely. Every name, address, and phone number on the screen is fictional.

## Run it

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43123](http://127.0.0.1:43123).

```bash
npm test
```

## Voice

The app reads `ELEVENLABS_API_KEY` from the environment (`.env`, which is gitignored). Copy `.env.example` and set your own key. Do not commit it.

When the key is present, the closeout and the tutor use a real **ElevenLabs agent**:

- Speech is the agent's voice (Flash).
- Listening is **Scribe** (`scribe_realtime`) when you allow the microphone.
- The agent can call a local client tool, `lookup_guardrail`, backed by `POST /api/tools/lookup-guardrail`.
- The debrief and the tutor can call `search_permits`, which searches an Algolia index named `public_permits` and cites the address, permit type, and status. The sample records are fictional.

Permit search runs on the server. Put `ALGOLIA_APP_ID`, `ALGOLIA_SEARCH_KEY`, and `ALGOLIA_WRITE_KEY` in `.env` (see `.env.example`). The write key stays on the server and is used only to create the `public_permits` index and the fictional samples. The browser never receives either key. If the Algolia app id and search key are unset, search uses a small local demo index and the screen says so.

If the live session cannot start (microphone blocked, for example), scripted lines fall back to ElevenLabs text-to-speech and the screen says so. If no key is set, the same pause → question → debrief → tutor loop runs in **demo mode** with browser speech. Typing an answer always works.

The app decides *when* to ask, so the agent stays quiet while you type or hold the talk button. `sendUserActivity` tells the live agent you are still typing.

## Judge path

1. **Capture.** Start the closeout for WO-1842 (Maya Chen, fictional). Capture the data plate, the finished install, and the T&P discharge. Write a note or insert the sample. Preview the branded PDF. After each pause the apprentice asks. One of those questions is the discharge guardrail. Use your own words or "Use the sample answer." The status line should say it is staying quiet while you type.
2. **Map.** Answer the three debrief questions. They were not asked during the closeout. Search the permit index for Harbor Lane and cite the hit. Optionally hold the sample aside off the record. Confirm the teach-back. Open any step or guardrail. You should see the screen as it was and the expert's words. Off-the-record wording is stamped and kept out of the tutor.
3. **Teach.** This is WO-2218, a gas heater the expert never closed. The discharge photo runs uphill. The permit search is already looking at Pike Street. Click **Save and send PDF**. The save does not go through. The tutor looks up **GR-11**, cites the permit hit, and explains with the expert's on-record words. Then ask whether you can text the PDF from a personal phone. That answer must not repeat anything you held off the record. **Leave the job open** is the call the expert taught.

A second wrong path: paste the customer phone into the note and save. That is **GR-07**, blocked before send.

## Guardrails in the demo

| Code | Rule |
| --- | --- |
| GR-04 | Data plate and finished install are both required. |
| GR-07 | No phone, email, or payment detail in the work note. |
| GR-11 | Uphill, missing, kinked, or capped T&P discharge: do not send the PDF. |
| GR-02 | Branded PDF, job number in the file, no customer name in the filename. |

Van crews do not override a T&P hold in this training story.
