# AdFrame

AdFrame creates advertising mockups on publisher websites through a React web interface and an Express/Puppeteer server. Users upload an image or paste an ad tag, choose a publisher and format, then download a PNG in their browser.

## Web deployment

The supported deployment is the web service in `render.yaml`. It builds the client, installs Chrome, and starts the Express server, which serves both the frontend and API. Node 22 is selected by `.node-version`. The Dockerfile provides an alternative using system Chromium.

- Build: `npm ci && npm run build && npm exec --prefix server -- puppeteer browsers install chrome`
- Start: `npm start`
- Health check: `/api/health`
- Render keeps the Chrome download inside the deployed project using `PUPPETEER_CACHE_DIR`.
- Configure server secrets and directories through environment variables, never through the public web interface.
- `GEMINI_API_KEY` is optional for the default curated Germany catalog. Set `SUGGESTION_DISCOVERY=gemini` to enable discovery with a key.

See [Render's Express deployment guide](https://render.com/docs/deploy-node-express-app), [Node version configuration](https://render.com/docs/node-version), and [Puppeteer browser configuration](https://pptr.dev/guides/configuration).

## Development

Use Node 22, run `npm ci`, then start `npm run dev:server` and `npm run dev:client` in separate terminals. For the built web interface, run `npm run build` followed by `npm start` and open `http://localhost:3001`.

The defaults use the same viewport, scan depth and capture height as the web deployment: 1366×900, 1600px initial scroll scan, 3400px maximum capture height, and a 70-second request deadline. See `.env.example` for environment overrides.

## Capture guarantees

- Consent cleanup protects publisher content roots.
- Slots require explicit advertising evidence; editorial, undersized, sticky and covered elements are rejected.
- Creatives retain their exact requested dimensions. Larger slots center the creative without stretching it.
- Iframe replacements preserve layout attributes. Failed attempts restore the original node, children and styles.
- Stable slot IDs support rescanning and selected-slot retries. A selected slot never silently falls through to another one.
- Source pixels are compared against the actual injected creative and the final screenshot. Failed validation returns an actionable error instead of saving a misleading mockup.
- Ad tags that do not render, including unsupported video placeholders, are rejected. Fonts are loaded rather than blocked.
- Each capture has an isolated browser context. Deadline expiration and browser disconnect cancel queued work and close the affected context.
- Heuristic placement remains an explicit opt-in and receives a warning; it cannot silently mask a rejected detected slot.

## Validation

- `npm test`: local browser fixtures covering every supported desktop/mobile format, consent cleanup, visibility, rollback, slot identity, tag rendering, timeouts, API errors and downloads. No external publisher pages are required.
- `npm run check:curated`: catalog shape and unsupported-country/topic behavior.
- `npm run build`: production client build.
- `npm run smoke:web`: four live publisher captures with the production configuration. Override `SMOKE_URLS`, `SMOKE_DEVICE`, or `SMOKE_AD_SIZE` for another sample.
- `npm run benchmark`: eight topic cases plus the other desktop/mobile formats. `BENCHMARK_TOPICS=news` narrows the matrix. Verified quality passes, HTTP success and warnings are counted separately. Partial results survive individual request failures.

GitHub Actions runs the build, browser regressions and catalog checks for pull requests and pushes to main.

## Storage and limitations

Downloads use the browser's download folder. Temporary server files and JSON quality metadata are stored under `server/output/` by default; uploads are cleaned up after requests. The download index is held in memory, so links expire when the process restarts or older entries are pruned. Render's default filesystem is ephemeral. Download results promptly; durable multi-instance storage is future work.

Public publisher layouts and ad tags can change. The app reports an unsupported or unverifiable placement rather than guaranteeing every publisher will work. The default curated catalog currently supports Germany and eight topics.
