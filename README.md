# Job Ticket Builder

A static, database-free rebuild of the `D365-CX-019-00` Smart Estimate Form
(Job Description Template). Picks up where the Adobe LiveCycle version left
off — same plants, same job types, same fields — but runs as a plain web page
instead of requiring Adobe Reader.

## Running it

This needs to be **served**, not opened directly as a `file://` path, because
`app.js` fetches `schema.json` over HTTP. Easiest options:

- Locally: `python3 -m http.server 8000` from this folder, then visit
  `http://localhost:8000`
- Hosted for free: push these 4 files to a GitHub repo and turn on GitHub
  Pages, same as the customer requisition site

## Files

- `index.html` — page shell
- `style.css` — all styling
- `app.js` — cover-page logic, the schema-driven form renderer, summary view,
  and PDF export
- `schema.json` — every plant/job-type template's sections and fields,
  extracted programmatically from the original PDF's embedded XFA template
  (not hand-typed, so it should match the source form's actual field set)

## How it works

1. **Cover page** — pick a plant and job type, same options as the original
   form's first page.
2. **Form** — only the sections that apply to that plant/job-type combination
   are shown. Where the original form branched on binding/paper style (coil,
   saddle-stitch, self-cover, binder, etc.), this shows a style selector and
   swaps in just that style's fields.
3. **Summary** — every field you actually filled in, organized by section.
   Nothing you left blank shows up here — that's the "smart" part carried
   over from the original.
4. **Download PDF** — turns the summary into a PDF you can save or send.

No data is sent anywhere or stored in a database — everything lives in the
browser tab for that session. There's a warning if you try to close the tab
with unsaved answers, but refreshing or navigating away loses progress, so
export to PDF before you leave the page.

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
- Every combination has been smoke-tested (renders without errors, style
  selectors and repeatable "add row" sections exercised, PDF export
  verified), but the field-by-field labels haven't been manually proofread
  against the original one by one — worth a pass before this replaces the
  Adobe form in daily use.

## If the source form changes

`schema.json` was generated from the PDF's embedded XFA template via a
small Python extraction script (not included here, but I can regenerate one
from an updated source PDF anytime).
