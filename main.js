var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SurfacePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// src/view.ts
var import_obsidian = require("obsidian");

// src/parser.ts
var HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
function parseEntries(content, filePath, patterns) {
  if (patterns.length === 0) return [];
  const lines = content.split("\n");
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) continue;
    const [, hashes, headingText] = headingMatch;
    let date = null;
    for (const pattern of patterns) {
      const m = headingText.match(pattern.regex);
      if (m) {
        date = pattern.toDate(m);
        if (date && !isNaN(date.getTime())) break;
        date = null;
      }
    }
    if (!date) continue;
    entries.push({
      date,
      headingText: lines[i].trim(),
      content: collectContent(lines, i, hashes.length),
      filePath,
      lineNumber: i + 1
    });
  }
  return entries;
}
function parseTermEntries(content, filePath, terms) {
  if (terms.length === 0) return [];
  const lines = content.split("\n");
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) continue;
    const [, hashes, headingText] = headingMatch;
    const lower = headingText.toLowerCase();
    for (const t of terms) {
      if (!t.term || !lower.includes(t.term.toLowerCase())) continue;
      entries.push({
        headingText: lines[i].trim(),
        content: collectContent(lines, i, hashes.length),
        filePath,
        lineNumber: i + 1,
        termId: t.id,
        termLabel: t.label || t.term
      });
      break;
    }
  }
  return entries;
}
function collectContent(lines, headingIndex, level) {
  const out = [];
  let j = headingIndex + 1;
  while (j < lines.length) {
    const next = lines[j].match(/^(#{1,6})\s/);
    if (next && next[1].length <= level) break;
    out.push(lines[j]);
    j++;
  }
  return out.join("\n").trim();
}
function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function isSameWeek(a, b) {
  const startOfWeek = (d) => {
    const copy = new Date(d);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}
function isSameMonth(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// src/view.ts
var VIEW_TYPE = "surface-view";
var MODES = ["day", "week", "month", "pinned"];
var MODE_LABELS = {
  day: "Day",
  week: "Week",
  month: "Month",
  pinned: "Pinned"
};
var SurfaceView = class extends import_obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.filterMode = "day";
    this.referenceDate = /* @__PURE__ */ new Date();
    this.rendering = false;
    this.renderRequested = false;
    this.autoRefreshIntervalId = null;
    this.plugin = plugin;
    this.component = new import_obsidian.Component();
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return "Surface";
  }
  getIcon() {
    return "calendar-search";
  }
  async onOpen() {
    this.component.load();
    this.registerDomEvent(window, "focus", () => {
      void this.syncReferenceDateToNowIfStale();
    });
    this.registerDomEvent(activeDocument, "visibilitychange", () => {
      if (!activeDocument.hidden) {
        void this.syncReferenceDateToNowIfStale();
      }
    });
    this.autoRefreshIntervalId = window.setInterval(() => {
      void this.syncReferenceDateToNowIfStale();
    }, 6e4);
    await this.render();
  }
  async onClose() {
    if (this.autoRefreshIntervalId !== null) {
      window.clearInterval(this.autoRefreshIntervalId);
      this.autoRefreshIntervalId = null;
    }
    this.component.unload();
  }
  async resetToNowAndRender() {
    this.referenceDate = /* @__PURE__ */ new Date();
    await this.render();
  }
  async shiftDate(direction) {
    const d = new Date(this.referenceDate);
    if (this.filterMode === "day") d.setDate(d.getDate() + direction);
    else if (this.filterMode === "week") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    this.referenceDate = d;
    await this.render();
  }
  formatLabel() {
    const d = this.referenceDate;
    if (this.filterMode === "day") {
      return d.toLocaleDateString(void 0, { month: "long", day: "numeric", year: "numeric" });
    }
    if (this.filterMode === "week") {
      const start = new Date(d);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const fmt = (x) => x.toLocaleDateString(void 0, { month: "short", day: "numeric" });
      return `${fmt(start)} \u2013 ${fmt(end)}, ${end.getFullYear()}`;
    }
    if (this.filterMode === "pinned") return "Pinned";
    return d.toLocaleDateString(void 0, { month: "long", year: "numeric" });
  }
  // -------------------------------------------------------------------------
  // Core render
  // -------------------------------------------------------------------------
  async render() {
    if (this.rendering) {
      this.renderRequested = true;
      return;
    }
    this.rendering = true;
    try {
      await this.renderInternal();
    } finally {
      this.rendering = false;
      if (this.renderRequested) {
        this.renderRequested = false;
        await this.render();
      }
    }
  }
  async renderInternal() {
    var _a;
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("surface-view");
    const header = container.createDiv("surface-header");
    const navContainer = header.createDiv("surface-nav-container");
    const navPills = navContainer.createEl("ul", {
      cls: "nav nav-pills",
      attr: { role: "tablist" }
    });
    for (const mode of MODES) {
      const isActive = mode === this.filterMode;
      const li = navPills.createEl("li", {
        cls: "nav-item",
        attr: { role: "presentation" }
      });
      li.createEl("button", {
        cls: "nav-link" + (isActive ? " active" : ""),
        text: MODE_LABELS[mode],
        attr: {
          role: "tab",
          "aria-selected": isActive ? "true" : "false",
          tabindex: isActive ? "0" : "-1"
        }
      }).onclick = async () => {
        this.filterMode = mode;
        if (mode !== "pinned") this.referenceDate = /* @__PURE__ */ new Date();
        await this.render();
      };
    }
    navPills.addEventListener("keydown", (e) => {
      const currentIndex = MODES.indexOf(this.filterMode);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.filterMode = MODES[(currentIndex + 1) % MODES.length];
        if (this.filterMode !== "pinned") this.referenceDate = /* @__PURE__ */ new Date();
        void this.render().then(() => {
          var _a2;
          (_a2 = this.containerEl.querySelector(".nav-link.active")) == null ? void 0 : _a2.focus();
        });
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.filterMode = MODES[(currentIndex - 1 + MODES.length) % MODES.length];
        if (this.filterMode !== "pinned") this.referenceDate = /* @__PURE__ */ new Date();
        void this.render().then(() => {
          var _a2;
          (_a2 = this.containerEl.querySelector(".nav-link.active")) == null ? void 0 : _a2.focus();
        });
      }
    });
    if (this.filterMode !== "pinned") {
      const navRow = header.createDiv("surface-nav-row");
      const prevBtn = navRow.createEl("button", {
        cls: "btn-nav-arrow prev",
        attr: { "aria-label": "Previous period" }
      });
      prevBtn.createDiv("arrow-icon");
      prevBtn.onclick = () => this.shiftDate(-1);
      navRow.createSpan({ cls: "surface-date-label", text: this.formatLabel() });
      const nextBtn = navRow.createEl("button", {
        cls: "btn-nav-arrow next",
        attr: { "aria-label": "Next period" }
      });
      nextBtn.createDiv("arrow-icon");
      nextBtn.onclick = () => this.shiftDate(1);
    }
    const entriesContainer = container.createDiv("surface-entries");
    if (this.filterMode === "pinned") {
      await this.renderPinnedEntries(entriesContainer);
      return;
    }
    const allEntries = await this.plugin.getEntries();
    const filtered = allEntries.filter((e) => this.isInSelection(e.date));
    if (filtered.length === 0) {
      entriesContainer.createEl("p", {
        text: `Nothing here for ${this.formatLabel()}.`,
        cls: "surface-empty-state"
      });
      return;
    }
    const byDate = /* @__PURE__ */ new Map();
    for (const entry of filtered) {
      const key = this.dateKey(entry.date);
      const list = (_a = byDate.get(key)) != null ? _a : [];
      list.push(entry);
      byDate.set(key, list);
    }
    for (const [, dateEntries] of byDate) {
      const section = entriesContainer.createDiv("surface-section");
      section.createEl("p", {
        cls: "surface-date-heading",
        text: this.formatDateHeading(dateEntries[0].date)
      });
      const group = section.createDiv("surface-entries-group");
      for (const entry of dateEntries) {
        this.renderEntryCard(group, entry);
      }
    }
  }
  // -------------------------------------------------------------------------
  // Pinned tab
  // -------------------------------------------------------------------------
  async renderPinnedEntries(container) {
    var _a;
    const terms = this.plugin.settings.surfaceTerms.filter((t) => t.term.trim().length > 0);
    if (terms.length === 0) {
      const msg = container.createEl("p", { cls: "surface-empty-state" });
      msg.appendText("No surface terms configured. Add terms in ");
      msg.createEl("a", {
        text: "Settings",
        href: "#"
      }).onclick = (e) => {
        e.preventDefault();
        this.plugin.openPluginSettings();
      };
      msg.appendText(".");
      return;
    }
    const termEntries = await this.plugin.getTermEntries();
    if (termEntries.length === 0) {
      container.createEl("p", {
        text: "No matching headings found in your vault.",
        cls: "surface-empty-state"
      });
      return;
    }
    const byTerm = /* @__PURE__ */ new Map();
    for (const t of terms) byTerm.set(t.id, []);
    for (const entry of termEntries) {
      (_a = byTerm.get(entry.termId)) == null ? void 0 : _a.push(entry);
    }
    for (const [termId, entries] of byTerm) {
      if (entries.length === 0) continue;
      const t = terms.find((x) => x.id === termId);
      const label = ((t == null ? void 0 : t.label) || (t == null ? void 0 : t.term) || termId).toUpperCase();
      const section = container.createDiv("surface-section");
      section.createEl("p", { cls: "surface-date-heading", text: label });
      const group = section.createDiv("surface-entries-group");
      for (const entry of entries) {
        this.renderEntryCard(group, entry);
      }
    }
  }
  // -------------------------------------------------------------------------
  // Entry card (shared by date and pinned views)
  // -------------------------------------------------------------------------
  renderEntryCard(container, entry) {
    var _a, _b;
    const fileName = (_b = (_a = entry.filePath.split("/").pop()) == null ? void 0 : _a.replace(/\.md$/, "")) != null ? _b : entry.filePath;
    const preview = this.extractPreview(entry.content);
    let expanded = false;
    const card = container.createDiv("surface-card");
    const summary = card.createDiv("surface-card-summary");
    const info = summary.createDiv("surface-card-info");
    info.createSpan({ cls: "surface-card-title", text: fileName });
    if (preview) {
      info.createSpan({ cls: "surface-card-preview", text: preview });
    }
    const chevron = summary.createDiv("surface-chevron");
    chevron.setAttribute("aria-hidden", "true");
    const jumpBtn = summary.createEl("button", {
      cls: "surface-jump-btn",
      text: "\u2197",
      attr: { "aria-label": "Open in note" }
    });
    jumpBtn.onclick = async (e) => {
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(entry.filePath);
      if (!(file instanceof import_obsidian.TFile)) return;
      const leaf = this.app.workspace.getLeaf();
      if (!leaf) return;
      await leaf.openFile(file);
      const view = leaf.view;
      if (view instanceof import_obsidian.MarkdownView) {
        view.editor.setCursor({ line: entry.lineNumber - 1, ch: 0 });
        view.editor.scrollIntoView(
          { from: { line: entry.lineNumber - 1, ch: 0 }, to: { line: entry.lineNumber - 1, ch: 0 } },
          true
        );
      }
    };
    const body = card.createDiv("surface-card-body");
    const bodyInner = body.createDiv("surface-card-body-inner");
    summary.onclick = async () => {
      if (bodyInner.childElementCount === 0) {
        if (entry.content) {
          await import_obsidian.MarkdownRenderer.render(this.app, entry.content, bodyInner, entry.filePath, this.component);
        } else {
          bodyInner.createEl("p", { text: "No content.", cls: "surface-empty-state" });
        }
      }
      expanded = !expanded;
      body.toggleClass("is-expanded", expanded);
      chevron.toggleClass("is-expanded", expanded);
      card.toggleClass("is-expanded", expanded);
    };
  }
  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  isInSelection(date) {
    if (this.filterMode === "day") return isSameDay(date, this.referenceDate);
    if (this.filterMode === "week") return isSameWeek(date, this.referenceDate);
    return isSameMonth(date, this.referenceDate);
  }
  dateKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }
  formatDateHeading(d) {
    return d.toLocaleDateString(void 0, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric"
    }).toUpperCase();
  }
  extractPreview(content) {
    var _a;
    const line = (_a = content.split("\n").find((l) => l.trim().length > 0)) != null ? _a : "";
    const clean = line.replace(/^[#>\-*_`\s]+/, "").trim();
    return clean.length > 72 ? clean.slice(0, 72) + "\u2026" : clean;
  }
  isReferenceDateStale(now) {
    if (this.filterMode === "pinned") return false;
    if (this.filterMode === "day") return !isSameDay(this.referenceDate, now);
    if (this.filterMode === "week") return !isSameWeek(this.referenceDate, now);
    return !isSameMonth(this.referenceDate, now);
  }
  async syncReferenceDateToNowIfStale() {
    const now = /* @__PURE__ */ new Date();
    if (!this.isReferenceDateStale(now)) return;
    this.referenceDate = now;
    await this.render();
  }
};

// src/settings.ts
var import_obsidian2 = require("obsidian");
var LONG_MONTH = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11
};
var SHORT_MONTH = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11
};
function createValidatedDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
    return null;
  }
  return date;
}
var BUILTIN_PATTERN_DEFS = [
  {
    id: "long-month-day-year",
    label: "Month D, YYYY",
    example: "March 4th, 2026 / April 23rd, 2026",
    regex: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i,
    toDate(m) {
      const month = LONG_MONTH[m[1].toLowerCase()];
      if (month === void 0) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[2], 10));
    }
  },
  {
    id: "iso-date",
    label: "YYYY-MM-DD",
    example: "2026-04-24",
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    toDate(m) {
      return createValidatedDate(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    }
  },
  {
    id: "us-short",
    label: "MM/DD/YYYY",
    example: "04/24/2026",
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    toDate(m) {
      return createValidatedDate(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    }
  },
  {
    id: "day-month-year",
    label: "D Month YYYY",
    example: "4th March 2026 / 23rd April 2026",
    regex: /^(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
    toDate(m) {
      const month = LONG_MONTH[m[2].toLowerCase()];
      if (month === void 0) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[1], 10));
    }
  },
  {
    id: "short-month",
    label: "Mon D, YYYY",
    example: "Mar 4th, 2026 / Apr 23rd, 2026",
    regex: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i,
    toDate(m) {
      const month = SHORT_MONTH[m[1].toLowerCase()];
      if (month === void 0) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[2], 10));
    }
  },
  {
    id: "day-short-month-year",
    label: "D Mon YYYY",
    example: "4th Mar 2026 / 23rd Apr 2026",
    regex: /^(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
    toDate(m) {
      const month = SHORT_MONTH[m[2].toLowerCase()];
      if (month === void 0) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[1], 10));
    }
  }
];
var DEFAULT_SETTINGS = {
  builtinPatterns: Object.fromEntries(
    BUILTIN_PATTERN_DEFS.map((p) => [p.id, p.id === "long-month-day-year"])
  ),
  surfaceTerms: []
};
function buildActivePatterns(settings) {
  const patterns = [];
  for (const def of BUILTIN_PATTERN_DEFS) {
    if (settings.builtinPatterns[def.id]) {
      patterns.push({ regex: def.regex, toDate: def.toDate });
    }
  }
  return patterns;
}
var SurfaceSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.saveTimer = null;
    this.plugin = plugin;
  }
  getSettingDefinitions() {
    return [
      {
        type: "group",
        heading: "Built-in date formats",
        items: [
          {
            name: "",
            desc: "Toggle which heading formats surface will recognize as dates. All formats support optional ordinal suffixes (1st, 2nd, 3rd...).",
            searchable: false
          },
          ...BUILTIN_PATTERN_DEFS.map((def) => ({
            name: def.label,
            desc: `Example: ${def.example}`,
            control: { type: "toggle", key: `pattern:${def.id}` }
          }))
        ]
      },
      {
        type: "list",
        heading: "Keyword terms",
        emptyState: "Any heading containing a term will appear in the pinned tab. The label is shown as the group header.",
        addItem: {
          name: "Add term",
          action: () => {
            this.plugin.settings.surfaceTerms.push({
              id: `term-${Date.now()}`,
              label: "",
              term: ""
            });
            void this.plugin.saveSettings();
            this.update();
          }
        },
        onDelete: (index) => {
          this.plugin.settings.surfaceTerms.splice(index, 1);
          void this.plugin.saveSettings();
          this.update();
        },
        onReorder: (oldIndex, newIndex) => {
          const terms = this.plugin.settings.surfaceTerms;
          const [moved] = terms.splice(oldIndex, 1);
          terms.splice(newIndex, 0, moved);
          void this.plugin.saveSettings();
        },
        items: this.plugin.settings.surfaceTerms.map((t, index) => ({
          name: t.label || t.term || "New term",
          aliases: t.term ? [t.term] : void 0,
          render: (setting) => {
            this.addTermInputs(setting, index);
          }
        }))
      }
    ];
  }
  getControlValue(key) {
    var _a;
    if (key.startsWith("pattern:")) {
      return (_a = this.plugin.settings.builtinPatterns[key.slice("pattern:".length)]) != null ? _a : false;
    }
    return void 0;
  }
  async setControlValue(key, value) {
    if (key.startsWith("pattern:")) {
      this.plugin.settings.builtinPatterns[key.slice("pattern:".length)] = value === true;
      await this.plugin.saveSettings();
    }
  }
  hide() {
    this.flushDebouncedSave();
  }
  addTermInputs(setting, index) {
    const t = this.plugin.settings.surfaceTerms[index];
    setting.addText(
      (text) => text.setPlaceholder("Label (e.g. Important)").setValue(t.label).onChange((value) => {
        this.plugin.settings.surfaceTerms[index].label = value;
        this.scheduleSave();
      })
    ).addText(
      (text) => text.setPlaceholder("Term to match (e.g. Important)").setValue(t.term).onChange((value) => {
        this.plugin.settings.surfaceTerms[index].term = value;
        this.scheduleSave();
      })
    );
  }
  scheduleSave() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.plugin.saveSettings();
    }, 300);
  }
  flushDebouncedSave() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.plugin.saveSettings();
    }
  }
};

// src/main.ts
var SurfacePlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.entriesCache = null;
    this.termEntriesCache = null;
  }
  async onload() {
    await this.loadSettings();
    this.registerView(VIEW_TYPE, (leaf) => new SurfaceView(leaf, this));
    this.addRibbonIcon("calendar-search", "Surface", async () => {
      await this.activateView();
    });
    this.addCommand({
      id: "open-side-menu",
      name: "Open side menu",
      callback: () => this.activateView()
    });
    this.addSettingTab(new SurfaceSettingTab(this.app, this));
    const invalidate = () => {
      this.entriesCache = null;
      this.termEntriesCache = null;
    };
    this.registerEvent(this.app.vault.on("modify", invalidate));
    this.registerEvent(this.app.vault.on("create", invalidate));
    this.registerEvent(this.app.vault.on("delete", invalidate));
  }
  onunload() {
  }
  async loadSettings() {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved != null ? saved : {});
    for (const key of Object.keys(DEFAULT_SETTINGS.builtinPatterns)) {
      if (this.settings.builtinPatterns[key] === void 0) {
        this.settings.builtinPatterns[key] = DEFAULT_SETTINGS.builtinPatterns[key];
      }
    }
    if (!this.settings.surfaceTerms) {
      this.settings.surfaceTerms = [];
    }
  }
  async saveSettings() {
    this.entriesCache = null;
    this.termEntriesCache = null;
    await this.saveData(this.settings);
  }
  async getEntries() {
    if (this.entriesCache) return this.entriesCache;
    const patterns = buildActivePatterns(this.settings);
    const entries = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(...parseEntries(content, file.path, patterns));
    }
    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.entriesCache = entries;
    return entries;
  }
  async getTermEntries() {
    if (this.termEntriesCache) return this.termEntriesCache;
    const terms = this.settings.surfaceTerms.filter((t) => t.term.trim().length > 0);
    const entries = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(...parseTermEntries(content, file.path, terms));
    }
    this.termEntriesCache = entries;
    return entries;
  }
  async activateView() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      await this.app.workspace.revealLeaf(existing[0]);
      const view = existing[0].view;
      if (view instanceof SurfaceView) {
        await view.resetToNowAndRender();
      }
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }
  openPluginSettings() {
    var _a, _b, _c, _d;
    const appWithSettings = this.app;
    (_b = (_a = appWithSettings.setting) == null ? void 0 : _a.open) == null ? void 0 : _b.call(_a);
    (_d = (_c = appWithSettings.setting) == null ? void 0 : _c.openTabById) == null ? void 0 : _d.call(_c, this.manifest.id);
  }
};
