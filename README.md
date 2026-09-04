# Inclusively Zera

A secondhand and deadstock storefront prototype for **House of Zera**, built so that screen reader,
keyboard, low-vision, motor and cognitive access are part of the product rather than a retrofit — and
so that every piece can name the EU circularity law that put it back into circulation.

The interface is the House of Zera design system from `design/House of Zera Home.dc.html`: Oswald
condensed over Barlow, slate blue on light grey, zero border radius, hairline rules, numbered
sections and blueprint corner marks. `assets/styles.css` carries the artboard's own token names
(`--ground`, `--slate-600`, `--ink-navy` …) and aliases them to the semantic names the accessibility
layer uses, so there is one palette rather than two.

**Live:** https://aryamansub17.github.io/house-of-zera/
**Accessibility statement:** [`docs/accessibility.html`](docs/accessibility.html)
**Sourcing database:** [`docs/data-sources.html`](docs/data-sources.html)

No build step, no framework, no dependencies. Static files and two JSON databases.

---

## What it does

**Shopping.** A five-question fit quiz that scores and sorts the collection, a filterable grid, a size
picker, a bag with quantity control, and a product passport per piece.

**Accessibility.** Read-aloud on hover and focus, a chaptered audio guide with a synced transcript,
voice control, generated sound cues, light/dark/high-contrast themes, text size and line and letter
spacing controls, a dyslexia-friendly font, forced link underlines, a bold focus ring, a reading
ruler, reduced motion, large touch targets, and keyboard shortcuts. Everything persists to
`localStorage`; nothing leaves the browser.

**Dressing filters.** The one accessibility feature that is about the clothes rather than the
interface: filter by whether a piece pulls on, can be fastened one-handed, is cut for seated wear, or
has no sewn-in tags. These are structured fields on every item, not marketing copy.

**Sourcing.** Every piece names the reuse channel it came through and the EU regulation behind that
channel, and links out to the primary source.

---

## Running it

The catalogue is fetched from `data/*.json`, which a browser will not read from a `file://` path.
Serve the folder:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. On GitHub Pages this works with no setup. If you do open
`index.html` directly, the page tells you exactly this rather than showing an empty grid.

### One self-contained file

For sending to someone, or for offline use, there is a packed build with the stylesheets, scripts,
both databases and every image inlined. It opens from a double-click with no server:

```bash
python3 build-single-file.py
```

That writes `inclusively-zera.html` (about 2.7 MB). Rebuild it after changing anything under
`assets/` or `data/`. Two caveats from `file://`: the web fonts still come from Google, so a machine
with no network falls back to system fonts, and voice control needs a secure origin, so it is
unavailable there — the shop, read-aloud, the audio guide, sound cues and every visual setting all
work.

---

## Layout

```
index.html                  the shop
assets/
  styles.css                house style: tokens, type, layout
  a11y.css                  everything a preference can change; panel, guide, passport, plates
  app.js                    catalogue, quiz, filters, bag, passport
  a11y.js                   preferences, speech, audio guide, sound cues, voice control, shortcuts
  plates.js                 draws each garment plate from its own record
  img/fabric/               the textile photographs, one per piece
data/
  sources.json              EU regulations and reuse channels, with citations
  inventory.json            the catalogue: passport, dressing data, sourcing, colourway, credits
docs/
  accessibility.html        what each feature does, who it is for, and what is still missing
  data-sources.html         generated from the JSON, so it cannot drift
design/                     the original Claude Design artboards, kept for reference
```

`app.js` and `a11y.js` are decoupled. The shop emits `zera:cart-add`, `zera:invalid`, `zera:step`,
`zera:ready`, `zera:speak` and `zera:speak-stop` on `document`; the accessibility layer listens. Add a
sound, a spoken cue or a new preference without touching the shop.

---

## The data

### `data/sources.json`

Three EU instruments, each with its citation, what it requires, and why it creates secondhand supply:

| Regulation | Status |
|---|---|
| **ESPR unsold-goods destruction ban** — Regulation (EU) 2024/1781, Art. 25 | In application since 19 July 2026 |
| **Textile EPR** — Directive (EU) 2025/1892 amending the Waste Framework Directive | In force since 16 October 2025; member states by April 2028 |
| **Digital Product Passport for textiles** — ESPR delegated acts | Basic passport expected 2027 |

Then twelve reuse channels — industrial sorters (Boer Group, TEXAID, SOEX/I:CO, Wtórpol, JMP Wilcox),
a social-enterprise sorter (Moda Re- / Cáritas), deadstock marketplaces (Recovo, Wasted Fabrics,
Unfrosen), matching platforms (Reverse Resources, Refashion Recycle), and House of Zera's own
hand-sourcing.

These organisations are real and every entry carries a source link. **Listing one is not a claim of a
commercial partnership** — `status` records where each route actually stands (`researched` vs
`active`), and the disclaimer is rendered on the sourcing page.

### `data/inventory.json`

Each item carries a `passport` block modelled on the EU Digital Product Passport (fibre composition
with percentages, origin, care, recyclability, reuse cycle), an `accessibility` block (closures,
pull-on, seated fit, tagless, notes), a `sourcing` block (channel, regulation, provenance, condition),
a `colour`, a `plate` silhouette and texture, and a `fabric` credit.

The catalogue is **prototype data**: names, prices and passport fields were written for this build,
and each channel attribution demonstrates the routing rather than recording a purchase. Items on
`local-thrift` are what House of Zera sources today. This is stated in the file and on the page.

---

## Images

Whole-garment photography without models does not exist at catalogue scale under an open licence, and
repeating one stock photo across unrelated one-of-one pieces would misrepresent them. So each piece is
shown as a **vector silhouette filled with a photograph of the real textile** — drawn from the item's
own `plate` and `colour` fields, with real cloth as the surface.

The fabric photographs are openly licensed, sourced through Openverse from Flickr, Rawpixel and the
Art Institute of Chicago under CC BY, CC BY-SA and CC0. Attribution travels with the image: it is
printed on the card, in the passport, and listed on the sourcing page. Full credits are in each item's
`fabric` block.

Being vector, the plates stay sharp at 200% text size and re-ink themselves for the dark and
high-contrast themes. **To use real photography instead**, set an item's `photo` to a file path — the
card switches automatically, no code change:

```json
{ "id": "p1", "photo": "assets/img/pieces/p1.jpg" }
```

Hero and team photography is © House of Zera.

---

## Browser support

The shop, the themes, the type controls and the keyboard layer work everywhere. Speech features
degrade rather than break: read-aloud and the audio guide need the Web Speech API (Chrome, Edge,
Safari; Firefox needs a system voice), and voice control needs `SpeechRecognition` (Chrome, Edge,
Safari). Where a feature is unavailable its control is disabled and says why, and the audio guide
falls back to its full transcript.

---

## Licence

Code is MIT (see `LICENSE`). Fabric photographs are licensed individually — see the credits above and
on the sourcing page. House of Zera brand assets are not covered by the MIT licence.
