# Reference implementations for UI annotation

Third-party sources collected to compare and improve the UI-element annotation
feature (element picking, selector generation, anchoring, highlights, popovers,
cover screenshots). They are **references, not dependencies**: nothing here is
vendored into the plugin, and code reuse requires checking the license first.

## Local retrieval setup

A dedicated XERJ corpus is indexed on this machine:

```sh
xerj code ui-annotation-refs "unique css selector generation" -k 5
xerj code ui-annotation-refs "text quote selector anchoring" -k 5 --mode semantic
xerj code ui-annotation-refs "highlight node content padding border margin" -k 5
xerj corpus list            # ui-annotation-refs (loaded)
```

- The indexed corpus is served by XERJ from **its own store**, not from this
  repository: `~/.xerj-code/corpora/ui-annotation-refs/` (manifest
  `corpus.json` plus a copy of the filtered source tree, 771 files / ~9 MB).
  The tree was filtered from the upstream checkouts (DevTools
  elements/sdk/overlay, Chromium overlay backend, browser-use DOM serializer,
  Playwright injected selectors, finder, css-selector-generator, Apache
  Annotator, Hypothesis anchoring, driver.js overlay, Floating UI positioning,
  html2canvas renderer) and registered as `ui-annotation-refs`; `corpus.json`
  keeps the original staging path only as provenance, so queries never read it.
- The staging checkouts (`.tmp-refs/…`, ~800 MB of full clones and a sparse
  DevTools tree) are a **build-time scratch tree and are not kept**. To rebuild
  the corpus, clone what the table below needs into any scratch path, filter it
  into a source tree, then `xerj corpus add ui-annotation-refs
  file://<that-tree>` followed by `xerj corpus index ui-annotation-refs`.
- Keep data/assets out of the indexed tree: a JSON file such as `corpus.json`
  creates a numeric `files` field, and a numeric field in a wildcard
  `multi_match` makes BM25 fail with `For input string` (the old full-clone
  corpus hit this; the filtered tree avoids it).
- Corpus-level license detection reports `NONE-FOUND` because the collection is
  mixed-license; per-source licenses are in the table below.

## Sources and what to read

| Source | License | Read this | Why it matters here |
|---|---|---|---|
| [Chrome DevTools frontend](https://github.com/ChromeDevTools/devtools-frontend) | BSD-3-Clause | `front_end/panels/elements/DOMPath.ts` (`cssPath`, `jsPath`, `xPath`), `DOMTreeContextMenu.ts` (Copy outerHTML/selector/JS path/XPath), `InspectElementModeController.ts`, `ElementsPanel.ts`, `front_end/core/sdk/OverlayModel.ts`, `inspector_overlay/` | The canonical inspect/pick + copy-selector UX. `cssPath` builds a structural path and does **not** verify uniqueness; our `uniqueSelector` does. |
| [Chromium inspector overlay](https://github.com/chromium/chromium/tree/main/third_party/blink/renderer/core/inspector) | BSD-3-Clause | `inspector_overlay_agent.cc`, `inspector_highlight.cc/.h`, `inspector_overlay_host.*` | How highlights are drawn: content/padding/border/margin quads, rulers, tooltips, inspect-mode label. |
| [browser-use](https://github.com/browser-use/browser-use) | MIT | current: `browser_use/repl/highlight.py` (overlay drawing); tag `0.1.40`: `browser_use/dom/buildDomTree.js`, `dom/service.py`, `dom/views.py` | DOM tree serialization + numbered highlight indices (Set-of-Marks); closest existing analogue to our page marks/group numbering. Current `main` moved the DOM serializer out of the repo, so the legacy tag is the useful copy. |
| [Playwright](https://github.com/microsoft/playwright) | Apache-2.0 | `packages/injected/src/selectorGenerator.ts`, `selectorEngine.ts`, `selectorUtils.ts`, `highlight.ts` | Resilient selector generation for recording + the injected element-highlight overlay. |
| [@medv/finder](https://github.com/antonmedv/finder) | MIT | `finder.ts` | Compact unique-CSS-selector generator; stability heuristics worth comparing with our candidate ordering. |
| [css-selector-generator](https://github.com/fczbkk/css-selector-generator) | MIT | `packages/css-selector-generator/src/` | Configurable selector strategies (id/class/tag/nth-child) + benchmark of selector libraries. |
| [Apache Annotator](https://github.com/apache/incubator-annotator) (retired) | Apache-2.0 | `packages/dom/src/{text-quote,text-position,range}`, `packages/selector` | W3C Web Annotation selector implementation: text quote + text position + range anchoring. |
| [Hypothesis client](https://github.com/hypothesis/client) | BSD (detected) | `src/annotator/anchoring/` (`text-range`, `match-quote`, `xpath`, `html`, `rendered-text`, `pdf`) | Production anchoring and recovery behavior; maps well to our four statuses. |
| [driver.js](https://github.com/kamranahmedse/driver.js) | license not auto-detected — verify before reuse | `packages/driver/src/{overlay,popover,core}` | Highlight overlay + popover positioning for tours; approach reference. |
| [Floating UI](https://github.com/floating-ui/floating-ui) | MIT | `packages/dom/src/{autoUpdate,middleware,platform}` | Popover/detail-card placement: flip, shift, clamp, virtual elements — what our hand-rolled anchoring approximates. |
| [html2canvas](https://github.com/niklasvh/html2canvas) | MIT | `src/dom/`, `src/render/` | Element/page rasterization for a possible element "cover" image on annotations. |
| [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/#selectors) | spec (W3C) | Selectors section | `CssSelector`, `XPathSelector`, `TextQuoteSelector`, `TextPositionSelector`, `RangeSelector`, `FragmentSelector` — the multi-strategy anchoring model. |

## How this maps to the plugin

| Plugin behavior | Closest reference |
|---|---|
| Leaf-first picking, Parent/Child, surface root | DevTools `InspectElementModeController` + overlay; browser-use DOM tree |
| Ordered selector candidates + verified unique CSS selector | DevTools `DOMPath.cssPath` (structure only), finder, css-selector-generator, Playwright `selectorGenerator` |
| Four honest statuses (Resolved/Matches several/No longer resolves/Content changed) | Hypothesis anchoring recovery, W3C selector fallbacks |
| Page marks with one ordinal per group | browser-use Set-of-Marks/highlight index |
| Pinning hover-triggered surfaces while editing | DevTools overlay/inspect-mode model (highlight survives pointer movement) |
| Detail card / popover placement and clamping | Floating UI middleware |
| Copy locator (future: Copy XPath / Copy JS path) | DevTools `DOMTreeContextMenu` + `DOMPath` |
| Possible element cover image | html2canvas / visual-feedback products |
| Text-leaf anchoring beyond CSS paths (future) | Apache Annotator `TextQuoteSelector`/`TextPositionSelector`, Hypothesis |

## License notes

- BSD-3-Clause: DevTools frontend, Chromium inspector overlay.
- Apache-2.0: Playwright, Apache Annotator.
- MIT: browser-use, finder, css-selector-generator, Floating UI, html2canvas.
- Hypothesis client: detected as BSD; driver.js: license file present but the
  detector reported none — verify before copying code (approach-only otherwise).
- Keep attribution when adapting code; prefer reimplementing concepts for
  tightly coupled internals.
