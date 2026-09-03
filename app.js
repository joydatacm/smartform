// ============================================================================
// Job Ticket Builder — schema-driven rebuild of the D365-CX-019-00 Smart
// Estimate Form (LiveCycle XFA). No database: everything lives in memory for
// the current session; the summary screen is the "organized output" and the
// PDF button turns it into a document you can save or hand off.
// ============================================================================

let SCHEMA = null;
let state = {};            // fieldPath -> value
let variantChoice = {};    // groupPath -> chosen prefix key
let rowCounts = {};        // repeatable-section path -> number of rows
let currentPlant = null;
let currentJobType = null;
let currentView = "cover"; // "cover" | "form" | "summary"

// ----------------------------------------------------------------------------
// Cover page config — hand-verified against the original form's click-event
// scripts (form1.TEMPLATES.<plant>.<jobtype>.presence = "visible"). A couple
// of notes carried over from the source form:
//   - Burlington's "Large Format" button opens the same template as its
//     Digital option in the original file (that's not a bug here; it mirrors
//     the source).
//   - Burlington's "Large Format Litho" button pointed at a subform that does
//     not exist anywhere in the source file — it was already dead in the
//     original. Shown here disabled rather than silently removed.
//   - Calgary's "Wide Format" and "Digital" buttons both open the LARGE
//     template, pre-selecting a style toggle inside it.
//   - Drummondville has no job-ticket template in this file at all — the
//     original just tells you to use a different form.
// ----------------------------------------------------------------------------
const COVER_CONFIG = [
  {
    plant: "TORBRAM",
    label: "Torbram",
    options: [
      { jobtype: "DIGITAL", label: "Digital Print / Lettershop", sub: "Includes Programming & Kitting" },
    ],
  },
  {
    plant: "THISTLE",
    label: "Thistle",
    options: [
      { jobtype: "COMMPRINT", label: "Commercial Print" },
      { jobtype: "BCandENV", label: "Business Cards & Envelopes" },
      { jobtype: "NEXandLARGEFORMAT", label: "Digital NEX & Large Format Flatbed" },
      { jobtype: "PRINTCOMP4MAILCAMP", label: "Print Components for Mailing Campaign" },
      { jobtype: "POD", label: "Digital (POD)" },
    ],
  },
  {
    plant: "BURLINGTON",
    label: "Burlington",
    options: [
      { jobtype: "DIGITAL", label: "Large Format", sub: "For campaign work, provide a spreadsheet instead" },
      { jobtype: "KITTING", label: "Kitting Only", sub: "For use by Burlington CX only" },
      { jobtype: null, label: "Large Format Litho", disabled: true, sub: "Not available in the source form either" },
    ],
  },
  {
    plant: "CALGARY",
    label: "Calgary",
    options: [
      { jobtype: "DIGITAL", label: "Digital Print / Lettershop" },
      { jobtype: "COMMPRINT", label: "Commercial Print" },
      { jobtype: "KITTING", label: "Kitting" },
      { jobtype: "LARGE", label: "Wide Format", presetField: { path: "Level11/RADIO", value: "b1" } },
      { jobtype: "LARGE", label: "Digital (Large Format)", presetField: { path: "Level11/RADIO", value: "b2" } },
    ],
  },
];

const DRUMMONDVILLE_NOTE = "Drummondville jobs use a different form in the source system — there's no job-ticket template for it in this file.";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function prettify(name) {
  if (!name) return "";
  const KNOWN = {
    TOP: "Job Info", MAIN: "", GRAPHICS: "Graphics", PAPER: "Paper",
    PRINTING: "Printing", BINDERY: "Bindery / Finishing", SHIPPING: "Shipping",
    LETTERSHOP: "Lettershop / Mailing", ADDITIONAL: "Additional Details",
    TITLE: "Title", BOTTOM: "", MORE: "More Details", REPEAT: "",
    COVER: "Cover", INSIDE: "Inside", OTHER: "Other", TABS: "Tabs",
  };
  if (name in KNOWN) return KNOWN[name];
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

const PREFIX_RE = /^([A-Z0-9]+)_(.+)$/;

// Given a list of sibling nodes, find sections that encode product/binding
// style variants (e.g. COIL_PAPER / SADDLE_PAPER / SELF_PAPER alongside a
// plain PAPER). Returns { groups: {base: {prefix: node}}, rest: [...] }.
function detectVariantGroups(children) {
  const groups = {};
  const baseOwners = {}; // base -> unprefixed node, if present
  const rest = [];
  for (const c of children) {
    if (c.kind !== "section") { rest.push(c); continue; }
    const m = PREFIX_RE.exec(c.name);
    if (m) {
      const [, prefix, base] = m;
      groups[base] = groups[base] || {};
      groups[base][prefix] = c;
    } else {
      rest.push(c);
    }
  }
  // Only treat as a "style choice" if 2+ variants exist for that base
  const realGroups = {};
  for (const [base, prefmap] of Object.entries(groups)) {
    if (Object.keys(prefmap).length >= 2) realGroups[base] = prefmap;
    else rest.push(...Object.values(prefmap));
  }
  return { groups: realGroups, rest };
}

function fieldPath(pathParts) {
  return pathParts.join("/");
}

// ----------------------------------------------------------------------------
// Rendering: COVER
// ----------------------------------------------------------------------------
function renderCover() {
  const root = document.getElementById("app");
  root.innerHTML = "";

  const wrap = el("div", { class: "cover-wrap" });
  wrap.appendChild(el("div", { class: "cover-kicker" }, "Production Job Ticket"));
  wrap.appendChild(el("h1", { class: "cover-title" }, "Which plant and job type?"));
  wrap.appendChild(el("p", { class: "cover-sub" },
    "Pick where the job runs and what kind of job it is — the form below will only show the fields that actually apply."));

  const grid = el("div", { class: "plant-grid" });
  for (const plant of COVER_CONFIG) {
    const card = el("div", { class: "plant-card" });
    card.appendChild(el("div", { class: "plant-name" }, plant.label));
    const list = el("div", { class: "plant-options" });
    for (const opt of plant.options) {
      const btn = el("button", {
        class: "job-btn" + (opt.disabled ? " job-btn-disabled" : ""),
        ...(opt.disabled ? { disabled: "disabled" } : {}),
        onclick: () => { if (!opt.disabled) selectTemplate(plant.plant, opt.jobtype, opt.presetField); },
      });
      btn.appendChild(el("span", { class: "job-btn-label" }, opt.label));
      if (opt.sub) btn.appendChild(el("span", { class: "job-btn-sub" }, opt.sub));
      list.appendChild(btn);
    }
    card.appendChild(list);
    grid.appendChild(card);
  }
  // Drummondville — informational only, no template in the source file
  const dcard = el("div", { class: "plant-card plant-card-note" });
  dcard.appendChild(el("div", { class: "plant-name" }, "Drummondville"));
  dcard.appendChild(el("p", { class: "plant-note-text" }, DRUMMONDVILLE_NOTE));
  grid.appendChild(dcard);

  wrap.appendChild(grid);
  root.appendChild(wrap);
}

function selectTemplate(plant, jobtype, presetField) {
  currentPlant = plant;
  currentJobType = jobtype;
  state = {};
  variantChoice = {};
  rowCounts = {};
  if (presetField) {
    state[`${plant}/${jobtype}/__toplevel__/${presetField.path}`] = presetField.value;
  }
  currentView = "form";
  render();
}

// ----------------------------------------------------------------------------
// Rendering: FORM
// ----------------------------------------------------------------------------
function renderForm() {
  const root = document.getElementById("app");
  root.innerHTML = "";

  const node = SCHEMA[currentPlant][currentJobType];
  const label = findCoverLabel(currentPlant, currentJobType);

  const header = el("div", { class: "form-header" });
  header.appendChild(el("button", { class: "back-link", onclick: goToCover }, "\u2190 Change plant / job type"));
  header.appendChild(el("h1", { class: "form-title" }, `${prettifyPlant(currentPlant)} \u2014 ${label}`));
  root.appendChild(header);

  const body = el("div", { class: "form-body" });
  const topLevelPath = [currentPlant, currentJobType, "__toplevel__"];
  renderChildrenInto(body, node.children, topLevelPath);
  root.appendChild(body);

  const footer = el("div", { class: "form-footer" });
  footer.appendChild(el("button", { class: "btn btn-primary", onclick: () => { currentView = "summary"; render(); } },
    "Review & Generate Job Ticket \u2192"));
  root.appendChild(footer);
}

function prettifyPlant(p) {
  return p.charAt(0) + p.slice(1).toLowerCase();
}

function findCoverLabel(plant, jobtype) {
  const pc = COVER_CONFIG.find((p) => p.plant === plant);
  if (!pc) return jobtype;
  const opt = pc.options.find((o) => o.jobtype === jobtype);
  return opt ? opt.label : jobtype;
}

// Renders a list of sibling schema nodes (fields/sections/labels/radiogroups)
// into a container, handling the variant-group and repeatable-occurs logic.
function renderChildrenInto(container, children, pathParts) {
  const { groups, rest } = detectVariantGroups(children);

  for (const [base, prefmap] of Object.entries(groups)) {
    container.appendChild(renderVariantSelector(base, prefmap, pathParts));
  }
  rest.forEach((child, idx) => {
    const rendered = renderNode(child, pathParts, idx);
    if (rendered) container.appendChild(rendered);
  });
}

function renderVariantSelector(base, prefmap, pathParts) {
  const groupPath = fieldPath(pathParts.concat(`__style__${base}`));
  const prefixes = Object.keys(prefmap);
  if (!(groupPath in variantChoice)) variantChoice[groupPath] = prefixes[0];

  const wrap = el("div", { class: "variant-block" });
  wrap.appendChild(el("div", { class: "variant-label" }, `${prettify(base)} style`));
  const seg = el("div", { class: "segmented" });
  for (const prefix of prefixes) {
    const active = variantChoice[groupPath] === prefix;
    const b = el("button", {
      class: "segmented-btn" + (active ? " segmented-btn-active" : ""),
      onclick: () => { variantChoice[groupPath] = prefix; render(); },
    }, prettify(prefix));
    seg.appendChild(b);
  }
  wrap.appendChild(seg);

  const chosen = prefmap[variantChoice[groupPath]];
  const contentWrap = el("div", { class: "variant-content" });
  renderChildrenInto(contentWrap, chosen.children, pathParts.concat(chosen.name));
  wrap.appendChild(contentWrap);
  return wrap;
}

function renderNode(node, pathParts, idx) {
  switch (node.kind) {
    case "section": return renderSection(node, pathParts, idx);
    case "field": return renderField(node, pathParts);
    case "radiogroup": return renderRadioGroup(node, pathParts);
    case "label": return el("p", { class: "note-text" }, node.text);
    default: return null;
  }
}

function renderSection(node, pathParts, idx) {
  const safeName = node.name || `_anon${idx != null ? idx : 0}`;
  const path = pathParts.concat(safeName);
  const isRepeatable = node.occurs && node.occurs.max !== "1";

  if (isRepeatable) {
    return renderRepeatable(node, pathParts, idx);
  }

  const title = prettify(node.name);
  const box = el("div", { class: "section-box" });
  if (title) box.appendChild(el("h3", { class: "section-title" }, title));
  const inner = el("div", { class: "section-inner" });
  renderChildrenInto(inner, node.children, path);
  if (!inner.childNodes.length) return null;
  box.appendChild(inner);
  return box;
}

function renderRepeatable(node, pathParts, idx) {
  const safeName = node.name || `_anon${idx != null ? idx : 0}`;
  const basePath = fieldPath(pathParts.concat(safeName));
  if (!(basePath in rowCounts)) rowCounts[basePath] = 1;

  const wrap = el("div", { class: "repeat-block" });
  const title = prettify(node.name);
  if (title) wrap.appendChild(el("h4", { class: "repeat-title" }, title));

  for (let i = 0; i < rowCounts[basePath]; i++) {
    const rowPath = pathParts.concat(`${safeName}#${i}`);
    const row = el("div", { class: "repeat-row" });
    row.appendChild(el("div", { class: "repeat-row-num" }, `#${i + 1}`));
    const rowFields = el("div", { class: "repeat-row-fields" });
    renderChildrenInto(rowFields, node.children, rowPath);
    row.appendChild(rowFields);
    if (rowCounts[basePath] > 1) {
      row.appendChild(el("button", {
        class: "row-remove", title: "Remove row",
        onclick: () => { rowCounts[basePath]--; render(); },
      }, "\u2715"));
    }
    wrap.appendChild(row);
  }
  wrap.appendChild(el("button", {
    class: "row-add",
    onclick: () => { rowCounts[basePath]++; render(); },
  }, "+ Add another"));
  return wrap;
}

function renderField(node, pathParts) {
  const path = fieldPath(pathParts.concat(node.name));
  const label = node.caption || prettify(node.name);
  const req = node.mandatory ? el("span", { class: "req-star" }, " *") : null;

  if (node.type === "checkbox" || node.type === "radio-option") {
    const row = el("label", { class: "checkbox-row" });
    const input = el("input", {
      type: "checkbox",
      onchange: (e) => { state[path] = e.target.checked; },
    });
    input.checked = !!state[path];
    row.appendChild(input);
    row.appendChild(el("span", {}, label));
    if (req) row.appendChild(req);
    if (node.tooltip) row.title = node.tooltip;
    return row;
  }

  const field = el("div", { class: "field-row" });
  const labelEl = el("label", { class: "field-label" }, [label, req]);
  field.appendChild(labelEl);

  let input;
  if (node.type === "textarea") {
    input = el("textarea", { class: "field-input", rows: "3", oninput: (e) => { state[path] = e.target.value; } });
    input.value = state[path] || "";
  } else if (node.type === "number") {
    input = el("input", { type: "number", class: "field-input", oninput: (e) => { state[path] = e.target.value; } });
    input.value = state[path] || "";
  } else if (node.type === "date") {
    input = el("input", { type: "date", class: "field-input", oninput: (e) => { state[path] = e.target.value; } });
    input.value = state[path] || "";
  } else if (node.type === "dropdown" && node.items && node.items.length) {
    input = el("select", { class: "field-input", onchange: (e) => { state[path] = e.target.value; } });
    input.appendChild(el("option", { value: "" }, "\u2014 Select \u2014"));
    for (const opt of node.items) input.appendChild(el("option", { value: opt }, opt));
    input.value = state[path] || "";
  } else if (node.type === "image") {
    return null; // reference-image fields aren't supported in this tool
  } else {
    input = el("input", { type: "text", class: "field-input", oninput: (e) => { state[path] = e.target.value; } });
    input.value = state[path] || "";
  }
  if (node.tooltip) input.title = node.tooltip;
  field.appendChild(input);
  return field;
}

function renderRadioGroup(node, pathParts) {
  const path = fieldPath(pathParts.concat(node.name));
  const wrap = el("div", { class: "radio-group" });
  wrap.appendChild(el("div", { class: "radio-group-label" }, prettify(node.name)));
  const opts = el("div", { class: "radio-options" });
  for (const opt of node.options) {
    const row = el("label", { class: "radio-row" });
    const input = el("input", {
      type: "radio", name: path,
      onchange: () => { state[path] = opt.name; render(); },
    });
    input.checked = state[path] === opt.name;
    row.appendChild(input);
    row.appendChild(el("span", {}, opt.caption || opt.name));
    opts.appendChild(row);
  }
  wrap.appendChild(opts);
  return wrap;
}

function goToCover() {
  currentView = "cover";
  render();
}

// ----------------------------------------------------------------------------
// Rendering: SUMMARY
// ----------------------------------------------------------------------------
function collectAnswers() {
  // Walk `state` (a flat map of path -> value) grouped by top-level section.
  const answered = Object.entries(state).filter(([, v]) => v !== "" && v !== false && v != null);
  return answered;
}

function humanPath(path) {
  return path.split("/")
    .filter((p) => p && p !== "__toplevel__" && !p.startsWith("__style__") && !p.startsWith("_anon"))
    .map((p) => p.replace(/#\d+$/, ""))
    .map(prettify)
    .filter(Boolean)
    .join(" \u203a ");
}

function renderSummary() {
  const root = document.getElementById("app");
  root.innerHTML = "";

  const label = findCoverLabel(currentPlant, currentJobType);
  const header = el("div", { class: "form-header" });
  header.appendChild(el("button", { class: "back-link", onclick: () => { currentView = "form"; render(); } }, "\u2190 Back to form"));
  header.appendChild(el("h1", { class: "form-title" }, "Job Ticket Summary"));
  header.appendChild(el("p", { class: "cover-sub" }, `${prettifyPlant(currentPlant)} \u2014 ${label}`));
  root.appendChild(header);

  const answers = collectAnswers();
  const body = el("div", { class: "summary-body" });

  if (!answers.length) {
    body.appendChild(el("p", { class: "note-text" }, "No fields filled in yet."));
  } else {
    for (const [path, value] of answers) {
      const row = el("div", { class: "summary-row" });
      row.appendChild(el("div", { class: "summary-path" }, humanPath(path)));
      row.appendChild(el("div", { class: "summary-value" }, String(value)));
      body.appendChild(row);
    }
  }
  root.appendChild(body);

  const footer = el("div", { class: "form-footer" });
  footer.appendChild(el("button", { class: "btn btn-secondary", onclick: () => { currentView = "form"; render(); } }, "Edit"));
  footer.appendChild(el("button", { class: "btn btn-primary", onclick: exportPDF }, "Download PDF"));
  root.appendChild(footer);
}

function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const marginX = 48;
  let y = 56;
  const lineH = 16;
  const pageH = doc.internal.pageSize.getHeight();

  const label = findCoverLabel(currentPlant, currentJobType);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Job Ticket", marginX, y); y += 22;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${prettifyPlant(currentPlant)} \u2014 ${label}`, marginX, y); y += 14;
  doc.text(new Date().toLocaleString(), marginX, y); y += 24;
  doc.setDrawColor(180); doc.line(marginX, y, 612 - marginX, y); y += 20;

  const answers = collectAnswers();
  if (!answers.length) {
    doc.text("No fields were filled in.", marginX, y);
  }
  for (const [path, value] of answers) {
    if (y > pageH - 60) { doc.addPage(); y = 56; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(humanPath(path).toUpperCase(), marginX, y); y += 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(String(value), 612 - marginX * 2);
    for (const ln of lines) {
      if (y > pageH - 60) { doc.addPage(); y = 56; }
      doc.text(ln, marginX, y); y += lineH;
    }
    y += 6;
  }

  const filename = `job-ticket-${currentPlant}-${currentJobType}-${Date.now()}.pdf`;
  doc.save(filename);
}

// ----------------------------------------------------------------------------
// Root render + boot
// ----------------------------------------------------------------------------
function render() {
  if (currentView === "cover") renderCover();
  else if (currentView === "form") renderForm();
  else if (currentView === "summary") renderSummary();
}

async function boot() {
  const res = await fetch("schema.json");
  SCHEMA = await res.json();
  render();
}

window.addEventListener("beforeunload", (e) => {
  if (Object.keys(state).length > 0) {
    e.preventDefault();
    e.returnValue = "";
  }
});

boot();
