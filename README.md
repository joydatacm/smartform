# Job Ticket Builder

A database-free rebuild of the `D365-CX-019-00` Smart Estimate Form (Job
Description Template). Same plants, same job types, same fields as the
Adobe LiveCycle version — runs as a plain web page instead.

## Running it

**`index.html` is the whole program.** Double-click it — it opens and works
immediately, no server, no setup, same as opening a PDF. Everything (styling,
the form data, the PDF export library) is bundled into that one file, so
there's nothing else to keep track of and no separate file that can get
opened by accident and mistaken for "the program."

To put it online later (e.g. GitHub Pages, same as the customer requisition
site), just upload this one file.

## How it works

1. **Cover page** — pick a plant and job type, same options as the original
   form's first page.
2. **Form** — only the sections that apply to that combination are shown.
   A "Jump to" nav on the left (a horizontal strip on narrower screens) lets
   you jump straight to Graphics/Paper/Printing/etc. Where the original
   branched on binding/paper style (coil, saddle-stitch, self-cover, binder,
   etc.), you get a style selector that swaps in just that style's fields.
3. **Summary** — every field you actually filled in, organized by section.
   Nothing left blank shows up here.
4. **Download PDF** — turns the summary into a real PDF.

Fully responsive — works the same on a phone, tablet, or desktop monitor.

No data is sent anywhere or stored in a database; everything lives in the
browser tab for that session. There's a warning if you try to close the tab
with unsaved answers, but refreshing loses progress, so export to PDF before
you navigate away.

## `app-source/` folder

The same app broken out into separate `index.html` / `app.js` / `style.css`
/ `schema.json` files, for if you ever want to hand-edit the styling or
logic — easier to work with piece by piece than the one big bundled file.
This isn't needed to run the app; the single `index.html` at the top level
is self-sufficient on its own. Unlike that top-level file, this folder's
`index.html` loads `schema.json` over `fetch()`, so it needs to be served
(`python3 -m http.server` from inside the folder, or GitHub Pages) rather
than double-clicked directly.

## Known gaps vs. the original

- **Burlington → "Large Format Litho"** is shown disabled. In the source
  form this button pointed at a template that doesn't actually exist in the
  file — it was already broken there, not something lost in this rebuild.
- **Image/signature fields** (26 in the original, mostly reference-image
  attachments) aren't rendered. Rare enough that it likely doesn't matter,
  but flagging it.
- A few of the more deeply nested legacy toggle sections (the Flex/FSC
  variant branches inside the Digital-family templates) render as plain
  sections rather than exactly replicating the original's specific
  click-to-reveal sequence. All the same fields are present; only the exact
  reveal choreography differs.
- Every combination has been end-to-end tested (loads, renders, style
  selectors and repeatable "add row" sections work, PDF export produces a
  real file) in an automated headless-browser test, but the field-by-field
  labels haven't been manually proofread against the original one by one —
  worth a pass before this replaces the Adobe form in daily use.

## If the source form changes

`schema.json` (in `app-source/`) was generated from the PDF's embedded XFA
template via a small Python extraction script (not included here, but I can
regenerate one from an updated source PDF anytime).

