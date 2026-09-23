# Pulse OS for iPhone

A SwiftUI client for the same backend the web dashboard uses. Phone only,
portrait only, dark only — the design is built for one hand.

## Building

The Xcode project is **generated**, not committed: `project.yml` is the source of
truth, so target settings live in one readable file instead of a merge-hostile
`.pbxproj`.

```bash
brew install xcodegen      # once
cd ios && xcodegen generate
open PulseOS.xcodeproj
```

## Talking to the backend

`Net/Backend.swift` points at:

- the Mac's LAN address on a real device — currently `192.168.1.12:4000`
- `localhost:4000` in the simulator

Both are overridable without a rebuild by setting `PULSE_API` in the scheme's
environment, which is how you point it at a hosted backend later.

Start the backend first, from the repo root:

```bash
npm run dev
```

Plain HTTP over the LAN needs two Info.plist keys, both generated from
`project.yml`: `NSAllowsLocalNetworking` and an ATS exception for that address.
**Both come out when the backend moves behind TLS.**

## Running on your own iPhone

Signing is an Apple constraint, not a project one. On a free account a
provisioning profile lasts **seven days**, after which the app stops launching
and has to be re-deployed from Xcode. A paid account gets a year, plus
TestFlight. Set `DEVELOPMENT_TEAM` in `project.yml` and regenerate.

## What is here

Home only, so far: greeting, next event, upcoming, forecast — live from
`/api/weather`, `/api/weather/forecast` and `/api/calendar/events`. The design
tokens in `Design/Theme.swift` and the sky phases in `Design/Sky.swift` are
ported value-for-value from the web app's stylesheet and `hooks/useSky.js`, so
the two stay one product rather than drifting into two.

Settings (name, city) are hardcoded defaults in `HomeModel.swift` — the web keeps
them in localStorage and there is no backend route for them yet.
