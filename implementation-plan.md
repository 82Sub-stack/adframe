# Web Capture Reliability Implementation

## Scope

AdFrame remains a hosted web application. This cycle replaces the local-app direction and addresses the reproduced screenshot failures without discarding the existing local Germany catalog and diagnostics work.

## Delivered

1. Web packaging, server-only configuration and browser downloads.
2. Safe consent cleanup and publisher-content validation.
3. Explicit ad-slot evidence, exact-size creatives and preserved iframe layout.
4. Stable slot identities, strict manual selection and rollback.
5. Source-pixel verification of injected and final creatives, with final layout remeasurement.
6. Enforced deadlines, disconnect cancellation and isolated capture contexts.
7. Production benchmark metrics, regression fixtures and continuous web checks.
8. Scrollable previews and persistent per-image quality JSON.

## Acceptance checks

- All seven supported device/format combinations preserve source dimensions.
- Empty pages, undersized slots and covered placements return errors without saved mockups.
- Successful image and HTML-tag requests produce downloadable PNGs with verified final pixels.
- Selected-slot retries preserve identity or fail explicitly.
- Timeouts free the browser context and queue while keeping unrelated pages open.
- Build and catalog checks pass; live publisher results are reported separately from controlled fixtures.

## Release sequence

Review the implementation, run GitHub web validation, then deploy through the existing Render web service. Hosted smoke validation and broad live vendor-tag coverage remain deployment follow-up work.
