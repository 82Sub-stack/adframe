# Project Status

## Current direction — 2026-10-08

AdFrame is a web application. React is served by the Express web server; Puppeteer captures publisher pages on the server. Render is the supported deployment. Electron, desktop packaging and desktop-only settings have been removed. Downloads use the user's browser.

## Implemented

- Protected publisher content during consent cleanup and added empty/blocked-page rejection.
- Exact creative dimensions, explicit ad evidence and safe iframe layout preservation.
- Stable slot identities, targeted-slot enforcement and rollback of failed attempts.
- Creative pixel verification after injection and in the final screenshot, including layout remeasurement after returning to the top.
- Output quality failures stop saving; JSON quality metadata accompanies accepted images.
- Enforced 70-second job deadlines, queued-job cancellation and isolated browser context cleanup.
- Fonts are retained and visible assets receive a bounded readiness wait.
- Scrollable desktop and phone previews expose the full captured page.
- Server-managed web settings; no public key or server-folder mutations.
- Expanded production benchmark with separate verified-success, HTTP-success and warning metrics.
- Added automated browser/API regressions and a GitHub Actions web validation workflow.
- Retained the previously local curated Germany catalog, candidate backups and diagnostics.

## Validation

- `npm test`: 24/24 browser and API regressions passed.
- `npm run build`: passed.
- `npm run check:curated`: passed.
- Live production smoke: Sport1, Gala, Focus and FinanzNachrichten all returned verified 300×250 desktop mockups. Generation times were 7–11 seconds per page.
- Report: `server/output/web-smoke/2026-10-08T07-11-53-339Z/report.json` (ignored local artifact).
- Controlled coverage includes all seven offered format/device combinations and HTML image, document.write and generic-script tags. Actual third-party vendor tags and the hosted server were not comprehensively tested.

These are a small live sample and controlled regression results, not a universal publisher success claim. Historical June results are not evidence of current visual correctness: the June 7 benchmark returned 22 images from 28 attempts using only 300×250 desktop image uploads.

## Deployment

The Render configuration uses Node 22, a health check, a project-local Chrome cache and one concurrent browser job. No deployment is triggered by local validation. The code must be reviewed and deployed before the hosted application uses these fixes.

## Remaining constraints

- Some publishers have no safe compatible slot within the capture limit; these return a clear failure.
- Default curated suggestions support Germany and eight topics.
- Live vendor tags still depend on network access, vendor behavior and consent; controlled tag fixtures do not certify every vendor integration.
- Generated download links use an in-memory index and expire after restart/pruning. Durable storage and multiple server instances are future work.
