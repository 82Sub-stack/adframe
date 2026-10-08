# Roadmap

## Current focus

Keep AdFrame on the web and measure usable screenshots rather than counting returned files.

## Completed — October 2026

- Removed the local-app distribution path and desktop settings.
- Protected publisher content, preserved creative size and iframe layout, and rejected covered/unsafe placements.
- Added stable slot IDs, failed-attempt rollback and final creative pixel validation.
- Connected request deadlines to cancellation and isolated browser contexts.
- Aligned capture defaults and benchmarks with the web deployment.
- Added browser/API regressions, all supported format cases, and GitHub Actions checks.
- Made desktop/mobile mockup previews scrollable.

## Next

1. Deploy the reviewed web changes and run the live smoke against the hosted server.
2. Tune the Germany catalog using successful captures with the new validation. Reject stale generation-proven rankings when live slot probes fail.
3. Expand live samples across devices, formats and actual vendor tags, recording first-attempt success, verified quality and generation duration.
4. Store recent success by publisher, device, format and verification date instead of a permanent boolean.
5. Add durable object storage and a persistent download index if results must survive restarts or multiple servers.

## Historical baseline

The June 7 full benchmark produced 22 HTTP-successful mockups from 28 attempts. It tested only 300×250 desktop image creatives and did not establish visual success. The earlier 23/27 claim was inconsistent and has been removed.
