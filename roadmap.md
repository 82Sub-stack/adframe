# Roadmap

## Next Focus

Improve mockup selection and generation quality so users get more relevant publisher choices, better ad placements, and more reliable final mockups.

## Phase 1: Selection Quality

- Audit the current suggestion scoring pipeline.
- Compare fallback corpus results against Gemini results.
- Improve ranking signals for reachable pages, ad-slot evidence, topic fit, country fit, and page quality.
- Add clearer rejection reasons for weak candidates.
- Keep the default suggestion pool at 20-30 sites per country where possible.

## Phase 2: Capture And Placement Quality

- Review screenshot capture failures and timeout behavior.
- Improve ad-slot detection for common publisher layouts.
- Add safer fallback placements when no slot is detected.
- Reduce mockups where ads overlap navigation, cookie banners, sticky UI, or unreadable page areas.
- Add output quality checks before saving final images.

## Phase 3: User Selection Workflow

- Make ranked candidates easier to compare before generation.
- Show why a site was recommended: reachability, ad signals, topic match, and confidence.
- Allow users to retry or replace weak sites without restarting the full flow.
- Consider saving recently successful publisher selections per country/topic.

## Phase 4: Reliability And Measurement

- Add focused smoke tests for suggestion and mockup generation flows.
- Track generation failure reasons in local logs.
- Add a small benchmark set of countries/topics/ad sizes.
- Use benchmark results to tune ranking and fallback placement rules.

## Immediate Next Step

Run a focused audit of the current generation pipeline and produce concrete changes for:

- website ranking,
- page capture robustness,
- ad placement detection,
- fallback placement rules,
- and final output quality checks.
