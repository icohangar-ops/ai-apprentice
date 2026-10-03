# save-guardrail Specification

## Purpose
Decide whether a new-hire closeout ticket may be saved and its PDF sent. Local guardrails stay authoritative for a known wrong save, and an optional text-only Jev reading supplies an allow or hold that the screen shows as the reason.

## Requirements

### Requirement: Local guardrails stop a wrong save without Jev
The system MUST stop a new-hire save when the local guardrail rules fail, including GR-11 when the Pike Street ticket discharge runs uphill, GR-07 when the work note contains a phone number, and GR-04 when the data plate photo is missing. This stop MUST still run when no Jev API key is configured and when a Jev call fails. The system MUST NOT crash in those cases. Algolia permit search MUST remain the source of the Pike Street permit citation, including an expired status.

#### Scenario: Missing key on the expired Pike Street ticket
- **WHEN** the new hire saves WO-2218 at 90 Pike Street with an uphill discharge and `JEV_API_KEY` is unset
- **THEN** the save and the PDF send do not happen, the screen cites GR-11, and the permit search still reports the expired Pike Street permit

#### Scenario: Jev cannot be reached
- **WHEN** a key is set but the Jev request fails
- **THEN** the local guardrail result still decides the save and the screen says Jev did not answer

### Requirement: Jev answers allow or hold before a save
When `JEV_API_KEY` is set, the system MUST call Jev before saving the new-hire ticket or sending its PDF. The request MUST be one Choice question whose options are `allow` and `hold`, evaluated over the written ticket state. The system MUST NOT send image bytes. A `hold` choice MUST stop the save and the PDF send. An `allow` choice MUST NOT override a local guardrail stop.

#### Scenario: Present key returns hold
- **WHEN** Jev chooses `hold` for a save
- **THEN** the ticket is not saved, the PDF is not sent, and the screen shows the hold as the reason

#### Scenario: Present key returns allow on an uphill Pike Street ticket
- **WHEN** Jev chooses `allow` and the local GR-11 rule fails for the uphill Pike Street discharge
- **THEN** the save still does not happen, GR-11 remains the stop, and the screen shows that Jev chose allow

#### Scenario: Present key returns allow on a clean ticket
- **WHEN** the local rules pass and Jev chooses `allow`
- **THEN** the ticket may be saved and the screen shows the allow reason

### Requirement: The Jev call uses the verified System One shape
The system MUST read the key only from `JEV_API_KEY`. It MUST NOT hardcode a key. The request MUST be `POST https://thejevai.com/v1/systemone` with `Authorization: Bearer` and a JSON body of `model`, `state`, and `questions`, using Choice, Score, or Noul question types only. The key MUST stay on the server.

#### Scenario: Request shape
- **WHEN** a configured save review calls Jev
- **THEN** the request uses that URL and bearer header, the body contains a Choice question named with `allow` and `hold`, and the state contains no image payload
