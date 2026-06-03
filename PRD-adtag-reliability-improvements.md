# PRD: Ad Tag Mock-Up Reliability Improvements

**Product:** AdFrame (Noel-Mockup)
**Author:** Auto-generated from codebase analysis
**Date:** 2026-03-18
**Status:** Draft
**Priority:** High

---

## 1. Background & Problem Statement

AdFrame is an internal tool that generates realistic mock-ups showing how ad creatives would appear on live publisher websites. The pipeline captures a publisher page via Puppeteer, detects existing ad slots in the DOM, injects the user's creative (image or ad tag), and takes a screenshot.

**The problem:** Despite recent hardening work (SSL fallbacks, memory limits, candidate retries), it remains difficult to get correct mock-ups with inserted ad tags. Users frequently encounter:

- **Blank/white creatives** — The ad tag didn't finish rendering before the screenshot was taken
- **Wrong placement** — The creative was injected into an editorial element, navigation bar, or hidden container instead of an actual ad slot
- **Broken creatives** — The ad tag required a specific runtime environment (e.g., DFP stubs, SafeFrame API) that wasn't provided
- **No recourse on failure** — When the automated placement is wrong, the user can only retry and hope for a different result

These issues stem from two root causes:
1. **Rendering failures:** Ad tags fail to render because of fixed timeouts and a one-size-fits-all rendering approach
2. **Placement failures:** The slot detection algorithm picks the wrong element and there's no visual verification or user override

---

## 2. Goals & Success Metrics

### Goals
- Increase the rate of correct, usable mock-ups from first attempt
- Reduce the number of blank/white creative captures to near-zero
- Give users control when automated placement fails
- Support a broader range of ad tag formats reliably

### Success Metrics
| Metric | Current (estimated) | Target |
|--------|-------------------|--------|
| First-attempt success rate | ~50-60% | >85% |
| Blank creative rate | ~20-30% | <5% |
| Wrong placement rate | ~15-20% | <10% |
| Average generation time | ~15-25s | <20s (should not regress significantly) |

### Non-Goals
- Changing the overall architecture (Puppeteer-based capture remains)
- Supporting video ad playback in mock-ups
- Real-time ad serving or live preview
- Mobile app ad placements

---

## 3. Feature Specifications

### 3.1 Feature: Wait-for-Render Verification Loop

**Priority:** P0 (implement first)
**Effort estimate:** Small
**Files to modify:** `server/services/puppeteer.js`

#### Current Behavior
The `renderAdTag()` function (line 792) uses a fixed delay after navigation:
```
await new Promise(r => setTimeout(r, ADTAG_WAIT_MS));  // 1.5s prod, 3s dev
```
A single `hasContent` check (line 860) runs once after the wait. If the ad hasn't loaded by then, the system captures a blank rectangle.

#### Required Behavior

Replace the fixed wait + single check with a **polling verification loop**:

1. After navigation completes (`domcontentloaded`), enter a polling loop
2. Every **300ms**, run the content detection check:
   - Check for visible DOM elements with dimensions > 10x10px (existing logic at line 860-873)
   - Additionally, sample pixels: check if the captured region is all-white or all-single-color (indicates no content rendered)
3. **Exit early** as soon as content is detected — fast creatives should complete in <500ms
4. **Hard timeout cap:** 8 seconds (production) / 12 seconds (development), configurable via `ADTAG_RENDER_MAX_WAIT_MS` env var
5. If timeout is reached without content:
   - Log diagnostic information: number of pending network requests, DOM element count, any console errors from the ad page
   - Still capture the screenshot (may be partially rendered)
   - Set a `renderConfidence: 'low'` flag on the response

#### Acceptance Criteria
- [ ] Ad tags that load in <500ms are captured in <1s total (no unnecessary waiting)
- [ ] Ad tags that take 3-5s to load (multi-redirect chains) are captured correctly
- [ ] After 8s with no content, the system proceeds with capture and logs diagnostics
- [ ] `ADTAG_RENDER_MAX_WAIT_MS` env var is respected
- [ ] Response includes `renderConfidence` field: `'high'` (content detected) or `'low'` (timeout reached)
- [ ] No regression in total generation time for simple image-based creatives

#### Technical Notes
- The pixel sampling check should use `page.screenshot()` on a small region (e.g., center 50x50px) and check for uniform color — avoid full-page screenshot for performance
- Network idle detection (`page.evaluate(() => performance.getEntriesByType('resource').filter(r => !r.responseEnd).length)`) can supplement visual checks
- The existing `hasContent` evaluation logic (line 860-873) should be extracted into a reusable function

---

### 3.2 Feature: Ad Tag Type-Specific Rendering Strategies

**Priority:** P0 (implement second)
**Effort estimate:** Medium
**Files to modify:** `server/services/puppeteer.js`

#### Current Behavior
`renderAdTag()` has 3 branches:
1. **iframe-src:** Extract src, navigate directly (line 813-827)
2. **Script tags:** Wrap in HTML, navigate to `data:text/html` URL (line 831-843)
3. **Plain HTML:** Use `page.setContent()` (line 845-857)

This misses many real-world ad tag patterns. For example:
- DFP/GPT tags need `googletag` API stubs
- `document.write()` tags break in data URLs because the document is already parsed
- SafeFrame-wrapped tags expect `$sf` API
- Multi-script chains need `networkidle0` instead of `domcontentloaded`

#### Required Behavior

Implement a **tag classifier** and **strategy dispatcher**:

**Step 1: Tag Classification**

Create a `classifyAdTag(adTagHtml)` function that returns a tag type:

| Pattern to detect | Classification | Detection regex/heuristic |
|---|---|---|
| `googletag`, `gpt.js`, `securepubads` | `'gpt'` | `/googletag\|gpt\.js\|securepubads/i` |
| `document.write(` | `'docwrite'` | `/document\.write\s*\(/` |
| `safeframe`, `$sf.` | `'safeframe'` | `/safeframe\|\$sf\./i` |
| `VAST`, `vpaid`, `ima3.js` | `'video'` | `/VAST\|vpaid\|ima3\.js/i` |
| `<iframe` with src | `'iframe'` | (existing detection) |
| `<script` without above patterns | `'generic-script'` | (existing detection) |
| No scripts | `'html'` | (existing detection) |

**Step 2: Type-Specific Rendering**

| Classification | Rendering Strategy |
|---|---|
| `'gpt'` | Inject `googletag` API stub (cmd queue, slot define/display stubs) before loading. Use `networkidle0` with 6s timeout. |
| `'docwrite'` | Navigate to `about:blank`, then execute `document.write(fullHtml)` via `page.evaluate()`. This preserves document.write behavior that breaks in data URLs. |
| `'safeframe'` | Inject minimal `$sf` API stubs (`$sf.ext.register()`, `$sf.ext.geom()`) into page context before loading creative. |
| `'video'` | Return a placeholder image with "Video Ad" label. Video rendering is out of scope (non-goal). |
| `'iframe'` | Existing iframe-src extraction logic (unchanged). |
| `'generic-script'` | Existing data URL approach (unchanged). |
| `'html'` | Existing setContent approach (unchanged). |

**Step 3: Response metadata**

Include the detected classification in the response:
```json
{
  "adTagType": "gpt",
  "renderStrategy": "gpt-stub",
  "renderConfidence": "high"
}
```

#### Acceptance Criteria
- [ ] `classifyAdTag()` correctly identifies DFP, document.write, SafeFrame, and video tags
- [ ] DFP tags with `googletag.cmd.push()` render successfully with GPT stubs
- [ ] `document.write()` tags render via `about:blank` strategy without errors
- [ ] SafeFrame-wrapped creatives don't crash with "$sf is not defined"
- [ ] Video tags return a clear placeholder (not a blank rectangle)
- [ ] Unrecognized tags fall back to existing generic rendering
- [ ] Tag classification is logged for debugging
- [ ] No regression for ad tags that currently work

#### Technical Notes: GPT Stub

Minimal stub to inject before GPT ad tags:
```javascript
window.googletag = window.googletag || {};
googletag.cmd = googletag.cmd || [];
googletag.defineSlot = () => ({ addService: () => ({}), setTargeting: () => ({}) });
googletag.enableServices = () => {};
googletag.display = () => {};
googletag.pubads = () => ({
  enableSingleRequest: () => {},
  collapseEmptyDivs: () => {},
  setTargeting: () => ({}),
  addEventListener: () => {},
});
```

#### Technical Notes: document.write Strategy
```javascript
await page.goto('about:blank');
await page.evaluate((html) => {
  document.open();
  document.write(html);
  document.close();
}, fullWrappedHtml);
```

---

### 3.3 Feature: Pre-Injection Visual Diff Validation

**Priority:** P1 (implement third)
**Effort estimate:** Medium
**Files to modify:** `server/services/puppeteer.js`

#### Current Behavior
In `injectCreativeIntoDetectedSlot()` (line 439), injection is considered successful if:
1. The DOM element is found
2. It passes editorial content checks
3. The `getBoundingClientRect()` returns non-zero dimensions after injection

However, this doesn't verify the creative is actually **visible** on screen. It could be:
- Behind a sticky header or fixed navigation
- Inside a collapsed accordion/tab
- Covered by a consent banner remnant
- At `opacity: 0` or `z-index: -1`
- Outside the visible clip region of the final screenshot

#### Required Behavior

Add visual verification after each injection attempt:

**Step 1: Pre-injection slot screenshot**
Before clearing the slot's children, capture a small screenshot of just the slot region:
```javascript
const preScreenshot = await page.screenshot({
  type: 'png',
  clip: { x: slotRect.left, y: slotRect.top, width: slotRect.width, height: slotRect.height }
});
```

**Step 2: Post-injection slot screenshot**
After injection + wait, capture the same region again.

**Step 3: Visual diff**
Compare the two screenshots:
- If they are identical (or nearly — allow 5% pixel tolerance for anti-aliasing), the injection had no visual effect → mark as failed, try next candidate
- If the post-injection screenshot is all-white or all-single-color, the creative likely didn't render → mark as failed

**Step 4: Additional pre-injection checks**
Before attempting injection on a candidate, verify:
- `getComputedStyle(el).opacity` > 0.1
- `getComputedStyle(el).zIndex` is not negative (or element is not behind a stacking context with higher z-index)
- Element is not inside a container with `overflow: hidden` that clips it out of view
- Element's position falls within the screenshot clip region (y < MAX_CAPTURE_HEIGHT)

#### Acceptance Criteria
- [ ] Injection into visually hidden slots (opacity 0, z-index -1, behind sticky nav) is detected and skipped
- [ ] Next candidate is tried when visual validation fails
- [ ] Visual diff uses small clipped screenshots (not full page) to minimize performance impact
- [ ] Total overhead per candidate check is <500ms
- [ ] Response includes `visuallyVerified: true/false` flag
- [ ] Slots outside the screenshot clip region (y > MAX_CAPTURE_HEIGHT) are excluded before injection attempt

#### Technical Notes
- Use Sharp (already a dependency) for image comparison: convert both screenshots to raw pixel buffers, compute percentage of changed pixels
- Threshold: >15% pixel change = visual difference confirmed
- Skip the pre-screenshot optimization if the slot is an iframe (iframes are inherently replaced, so visual diff always shows change)
- This check adds ~300-500ms per candidate attempt; with max 5 candidates, worst case is ~2.5s additional time

---

### 3.4 Feature: Multi-Slot Preview with User Choice

**Priority:** P1 (implement fourth)
**Effort estimate:** Large
**Files to modify:**
- `server/services/puppeteer.js` — slot annotation rendering
- `server/routes/mockup.js` — new endpoint, response format changes
- `client/src/components/PreviewPanel.jsx` — slot picker UI
- `client/src/components/InputPanel.jsx` — workflow changes

#### Current Behavior
The system picks the single highest-scoring slot and injects into it. The user sees only the final result. If the placement is wrong, the only option is to retry (which often produces the same result since the scoring is deterministic for a given page).

#### Required Behavior

**Phase A: Backend — Return Candidate Slots with Annotations**

Modify the `/api/generate-mockup` response to include slot candidates:

```json
{
  "mockupId": "uuid",
  "mockupUrl": "/api/download-mockup/uuid/preview",
  "annotatedPreviewUrl": "/api/download-mockup/uuid/annotated",
  "slotCandidates": [
    {
      "slotId": "adf-slot-1",
      "rank": 1,
      "score": 87,
      "type": "gpt",
      "x": 350, "y": 200,
      "width": 728, "height": 90,
      "confidence": "high"
    },
    {
      "slotId": "adf-slot-3",
      "rank": 2,
      "score": 72,
      "type": "iframe",
      "x": 900, "y": 450,
      "width": 300, "height": 250,
      "confidence": "medium"
    },
    {
      "slotId": "adf-slot-5",
      "rank": 3,
      "score": 61,
      "type": "size-match",
      "x": 100, "y": 800,
      "width": 300, "height": 250,
      "confidence": "low"
    }
  ],
  "placement": { ... }
}
```

Generate an **annotated preview** image:
- Take the base screenshot (before injection)
- Draw colored semi-transparent rectangles over each candidate slot:
  - Rank 1: Green (#00C853, 30% opacity)
  - Rank 2: Blue (#2196F3, 30% opacity)
  - Rank 3: Orange (#FF9800, 30% opacity)
- Add numbered labels (1, 2, 3) in the corner of each rectangle
- Use Sharp's composite capabilities for this

**Phase B: New API Endpoint — Targeted Injection**

Add `POST /api/generate-mockup/:id/inject`:

```
Request body:
{
  "slotId": "adf-slot-3"
}

Response:
{
  "mockupId": "uuid-new",
  "mockupUrl": "/api/download-mockup/uuid-new/preview",
  "placement": {
    "method": "user-selected",
    "slotId": "adf-slot-3",
    ...
  }
}
```

This requires keeping the Puppeteer page alive (or the page state cached) between the initial generation and the targeted injection. Two approaches:

**Option A (Recommended): Re-capture and inject**
- Store the original request parameters with the mockup
- On `/inject`, re-run the capture pipeline but skip slot detection and inject directly into the specified slot
- Simpler, more reliable, but slower (~10-15s)

**Option B: Page pool**
- Keep the Puppeteer page open for 60s after initial generation
- On `/inject`, reuse the existing page
- Faster (~3-5s) but uses more memory and adds complexity

Recommend **Option A** for reliability given the memory constraints on Render.

**Phase C: Frontend — Slot Picker UI**

Add a slot selection step between generation and final result:

1. After initial generation, if `slotCandidates.length > 1`:
   - Show the annotated preview image
   - Display a slot selector below with cards for each candidate:
     ```
     [1] Leaderboard (728x90) — Score: 87 — GPT slot ✓
     [2] Rectangle (300x250) — Score: 72 — iframe
     [3] Rectangle (300x250) — Score: 61 — size match
     ```
   - Highlight the auto-selected slot (rank 1) as default
   - "Use this placement" button (proceeds with rank 1)
   - Clicking a different slot → triggers `/inject` endpoint → shows new mock-up

2. If only 1 candidate or score > 90 (high confidence): skip the picker, show result directly (current behavior)

3. Add a toggle in settings: "Always show slot picker" vs "Auto-select best slot"

#### Acceptance Criteria
- [ ] Annotated preview image shows colored rectangles for top 3 slot candidates
- [ ] `/api/generate-mockup/:id/inject` endpoint works with a specific slotId
- [ ] Frontend displays slot picker when multiple candidates exist
- [ ] User can select a different slot and get a new mock-up
- [ ] High-confidence single-slot results skip the picker (no UX regression)
- [ ] Annotated preview is generated using Sharp compositing (no canvas/browser dependency)
- [ ] Slot candidate metadata (score, type, dimensions) is shown in the UI
- [ ] Re-capture approach handles the case where the page has changed between requests

#### Wireframe

```
┌─────────────────────────────────────────────────┐
│  Mock-Up Preview                                │
│  ┌───────────────────────────────────────────┐  │
│  │                                           │  │
│  │   [Publisher Website Screenshot]          │  │
│  │                                           │  │
│  │   ┌──[1]── 728x90 ──────────────────┐    │  │
│  │   │  (green overlay)                 │    │  │
│  │   └──────────────────────────────────┘    │  │
│  │                                           │  │
│  │              ┌──[2]──┐                    │  │
│  │              │300x250│                    │  │
│  │              │(blue) │                    │  │
│  │              └───────┘                    │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  Select ad placement:                           │
│  ┌─────────────────────────────────────┐        │
│  │ ● Slot 1: Leaderboard (728x90)     │ ← selected
│  │   Score: 87 | GPT slot | High conf  │        │
│  ├─────────────────────────────────────┤        │
│  │ ○ Slot 2: Rectangle (300x250)      │        │
│  │   Score: 72 | iframe | Medium conf  │        │
│  ├─────────────────────────────────────┤        │
│  │ ○ Slot 3: Rectangle (300x250)      │        │
│  │   Score: 61 | Generic | Low conf    │        │
│  └─────────────────────────────────────┘        │
│                                                 │
│  [ Use This Placement ]  [ Try Different Slot ] │
└─────────────────────────────────────────────────┘
```

---

## 4. Implementation Order & Dependencies

```
Phase 1 (P0):  Feature 3.1 (Render Loop)     ──→  No dependencies
               Feature 3.2 (Tag Strategies)   ──→  No dependencies
               (Can be implemented in parallel)

Phase 2 (P1):  Feature 3.3 (Visual Diff)      ──→  Benefits from 3.1 (better renders = better diffs)
               Feature 3.4 (Multi-Slot UI)     ──→  Independent, but benefits from 3.3 validation
```

---

## 5. Architecture Overview

```
User submits ad tag + website URL
            │
            ▼
   ┌─── classifyAdTag() ───┐         ◄── NEW (3.2)
   │  gpt│docwrite│generic │
   └────────┬───────────────┘
            │
            ▼
   ┌─── renderAdTag() ─────┐
   │  type-specific strategy│         ◄── MODIFIED (3.2)
   │  + render poll loop    │         ◄── NEW (3.1)
   └────────┬───────────────┘
            │ rendered PNG
            ▼
   ┌─── captureWebsite() ──┐
   │  navigate + consent    │
   │  detectAdSlots()       │
   │  ┌─── for each slot ──┐│
   │  │ pre-check z/opacity ││        ◄── NEW (3.3)
   │  │ inject creative     ││
   │  │ visual diff verify  ││        ◄── NEW (3.3)
   │  └────────────────────┘│
   └────────┬───────────────┘
            │
            ▼
   ┌─── Response ──────────┐
   │  mockup PNG            │
   │  annotated preview     │         ◄── NEW (3.4)
   │  slot candidates[]     │         ◄── NEW (3.4)
   │  renderConfidence      │         ◄── NEW (3.1)
   │  adTagType             │         ◄── NEW (3.2)
   └────────┬───────────────┘
            │
            ▼
   ┌─── Frontend ──────────┐
   │  slot picker UI        │         ◄── NEW (3.4)
   │  → /inject endpoint    │         ◄── NEW (3.4)
   └────────────────────────┘
```

---

## 6. Testing & Verification

### For Feature 3.1 (Render Loop)
- Test with a fast-loading static HTML ad tag — should complete in <1s
- Test with a slow-loading DFP tag (multi-redirect) — should wait and capture correctly
- Test with a completely broken tag (404 script src) — should timeout at 8s and return low-confidence result
- Verify `ADTAG_RENDER_MAX_WAIT_MS` env var is respected

### For Feature 3.2 (Tag Strategies)
- Test with a real DFP `googletag.cmd.push()` tag — should render with GPT stubs
- Test with a `document.write()` tag — should render via about:blank strategy
- Test with a plain `<img>` tag — should use existing HTML path (no regression)
- Test with a `<script src="...">` tag — should use existing data URL path

### For Feature 3.3 (Visual Diff)
- Test injection into a visible slot — visual diff should confirm change
- Test injection into a slot behind a sticky nav — should detect no visual change and skip
- Test injection into a slot with `opacity: 0` — should be excluded pre-check
- Verify performance: each validation adds <500ms

### For Feature 3.4 (Multi-Slot UI)
- Test with a page that has multiple ad slots — should show annotated preview
- Test slot selection — clicking slot 2 should re-generate with that placement
- Test with a page that has 1 high-confidence slot — should skip picker
- Test the `/inject` endpoint with valid and invalid slotIds

### End-to-End Regression
- Run the full pipeline with 10 different publisher websites and ad sizes
- Compare success rate before and after each feature
- Ensure total generation time stays under 30s for typical cases

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Render polling loop increases generation time | Medium | Early exit on content detection; hard cap at 8s; most ads load in <3s |
| GPT/SafeFrame stubs don't match real API | Low | Stubs only need to prevent errors, not provide full functionality; ad renders as image anyway |
| Visual diff is CPU-intensive with Sharp | Low | Only compare small clipped regions (~300x250px), not full pages |
| Page changes between initial capture and `/inject` re-capture | Medium | Accept this limitation; document it; consider caching page HTML as future optimization |
| Render memory on production (Render platform) | High | All features respect existing concurrency limits; no additional Puppeteer pages opened simultaneously |

---

## 8. Open Questions

1. **Should the slot picker be opt-in or default?** Recommendation: default when confidence < 80, opt-in toggle for "always show"
2. **Should we log ad tag classifications for analytics?** Recommendation: yes, to a simple JSON log file to understand the distribution of tag types
3. **What's the acceptable performance budget for visual diff validation?** Recommendation: 500ms per candidate, 2.5s worst case (5 candidates)
