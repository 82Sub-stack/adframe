# Project Status

## Current State

AdFrame is ready for internal macOS testing as a locally executed desktop app. The Electron app, local Express server, settings storage, configurable output folder, bundled Chromium path, and expanded country publisher corpus are merged into `main`.

## Distribution

- Internal unsigned macOS DMG path is active.
- Current prepared artifact: `release/AdFrame-1.0.0-arm64.dmg`.
- Recipient install note: `release/README-INSTALL.txt`.
- Distribution guide: `docs/internal-macos-dmg-distribution.md`.
- Signing/notarization is optional future work and remains separate from the active internal distribution path.

## Validation Completed

- Web/client build passes.
- macOS desktop package builds.
- Packaged macOS app smoke test passed.
- Bundled Chromium mode works in the packaged app.
- Website suggestions return scored results.
- Audits previously returned zero vulnerabilities.

## Open Blockers

No blockers before improving mockup selection and generation.

## Known Constraints

- Current macOS package is Apple Silicon (`arm64`).
- Windows runtime validation was intentionally skipped.
- Unsigned internal builds require first-launch Gatekeeper approval on macOS.
- The app still needs internet access for publisher pages and Gemini-backed suggestions.
