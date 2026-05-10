import { ItemView, WorkspaceLeaf, TFile, MarkdownView, MarkdownRenderer, Component } from "obsidian";
import type SurfacePlugin from "./main";
import { BaseEntry, DateEntry, TermEntry, isSameDay, isSameWeek, isSameMonth } from "./parser";

export const VIEW_TYPE = "surface-view";
export type FilterMode = "day" | "week" | "month" | "pinned";

const MODES: FilterMode[] = ["day", "week", "month", "pinned"];
const MODE_LABELS: Record<FilterMode, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  pinned: "Pinned",
};

export class SurfaceView extends ItemView {
  plugin: SurfacePlugin;
  private filterMode: FilterMode = "day";
  private referenceDate: Date = new Date();
  private component: Component;
  private rendering = false;
  private renderRequested = false;
  private autoRefreshIntervalId: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: SurfacePlugin) {
    super(leaf);
    this.plugin = plugin;
    this.component = new Component();
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return "Surface"; }
  getIcon() { return "calendar-search"; }

  async onOpen() {
    this.component.load();

    this.registerDomEvent(window, "focus", () => {
      void this.syncReferenceDateToNowIfStale();
    });

    this.registerDomEvent(document, "visibilitychange", () => {
      if (!document.hidden) {
        void this.syncReferenceDateToNowIfStale();
      }
    });

    this.autoRefreshIntervalId = window.setInterval(() => {
      void this.syncReferenceDateToNowIfStale();
    }, 60_000);

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
    this.referenceDate = new Date();
    await this.render();
  }

  private async shiftDate(direction: -1 | 1) {
    const d = new Date(this.referenceDate);
    if (this.filterMode === "day") d.setDate(d.getDate() + direction);
    else if (this.filterMode === "week") d.setDate(d.getDate() + direction * 7);
    else d.setMonth(d.getMonth() + direction);
    this.referenceDate = d;
    await this.render();
  }

  private formatLabel(): string {
    const d = this.referenceDate;
    if (this.filterMode === "day") {
      return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
    }
    if (this.filterMode === "week") {
      const start = new Date(d);
      const day = start.getDay();
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const fmt = (x: Date) => x.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `${fmt(start)} \u2013 ${fmt(end)}, ${end.getFullYear()}`;
    }
    if (this.filterMode === "pinned") return "Pinned";
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  // -------------------------------------------------------------------------
  // Core render
  // -------------------------------------------------------------------------

  private async render() {
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

  private async renderInternal() {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("surface-view");

    const header = container.createDiv("surface-header");

    // Tab bar
    const navContainer = header.createDiv("surface-nav-container");
    const navPills = navContainer.createEl("ul", {
      cls: "nav nav-pills",
      attr: { role: "tablist" },
    });

    for (const mode of MODES) {
      const isActive = mode === this.filterMode;
      const li = navPills.createEl("li", {
        cls: "nav-item",
        attr: { role: "presentation" },
      });
      li.createEl("button", {
        cls: "nav-link" + (isActive ? " active" : ""),
        text: MODE_LABELS[mode],
        attr: {
          role: "tab",
          "aria-selected": isActive ? "true" : "false",
          tabindex: isActive ? "0" : "-1",
        },
      }).onclick = async () => {
        this.filterMode = mode;
        if (mode !== "pinned") this.referenceDate = new Date();
        await this.render();
      };
    }

    // Keyboard navigation for the tab bar
    navPills.addEventListener("keydown", async (e: KeyboardEvent) => {
      const currentIndex = MODES.indexOf(this.filterMode);
      if (e.key === "ArrowRight") {
        e.preventDefault();
        this.filterMode = MODES[(currentIndex + 1) % MODES.length];
        if (this.filterMode !== "pinned") this.referenceDate = new Date();
        await this.render();
        (this.containerEl.querySelector(".nav-link.active") as HTMLElement)?.focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.filterMode = MODES[(currentIndex - 1 + MODES.length) % MODES.length];
        if (this.filterMode !== "pinned") this.referenceDate = new Date();
        await this.render();
        (this.containerEl.querySelector(".nav-link.active") as HTMLElement)?.focus();
      }
    });

    // Navigation row — only shown for date modes
    if (this.filterMode !== "pinned") {
      const navRow = header.createDiv("surface-nav-row");

      const prevBtn = navRow.createEl("button", {
        cls: "btn-nav-arrow prev",
        attr: { "aria-label": "Previous period" },
      });
      prevBtn.createDiv("arrow-icon");
      prevBtn.onclick = () => this.shiftDate(-1);

      navRow.createEl("span", { cls: "surface-date-label", text: this.formatLabel() });

      const nextBtn = navRow.createEl("button", {
        cls: "btn-nav-arrow next",
        attr: { "aria-label": "Next period" },
      });
      nextBtn.createDiv("arrow-icon");
      nextBtn.onclick = () => this.shiftDate(1);
    }

    const entriesContainer = container.createDiv("surface-entries");

    if (this.filterMode === "pinned") {
      await this.renderPinnedEntries(entriesContainer);
      return;
    }

    // -------------------------------------------------------------------------
    // Date entries
    // -------------------------------------------------------------------------
    const allEntries = await this.plugin.getEntries();
    const filtered = allEntries.filter(e => this.isInSelection(e.date));

    if (filtered.length === 0) {
      entriesContainer.createEl("p", {
        text: `Nothing here for ${this.formatLabel()}.`,
        cls: "surface-empty-state",
      });
      return;
    }

    // Group by date, preserving sort order (allEntries is already date-desc)
    const byDate = new Map<string, DateEntry[]>();
    for (const entry of filtered) {
      const key = this.dateKey(entry.date);
      const list = byDate.get(key) ?? [];
      list.push(entry);
      byDate.set(key, list);
    }

    for (const [, dateEntries] of byDate) {
      const section = entriesContainer.createDiv("surface-section");
      section.createEl("p", {
        cls: "surface-date-heading",
        text: this.formatDateHeading(dateEntries[0].date),
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

  private async renderPinnedEntries(container: HTMLElement) {
    const terms = this.plugin.settings.surfaceTerms.filter(t => t.term.trim().length > 0);

    if (terms.length === 0) {
      const msg = container.createEl("p", { cls: "surface-empty-state" });
      msg.appendText("No surface terms configured. Add terms in ");
      msg.createEl("a", {
        text: "Settings",
        href: "#",
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
        cls: "surface-empty-state",
      });
      return;
    }

    // Group by term, preserving definition order from settings
    const byTerm = new Map<string, TermEntry[]>();
    for (const t of terms) byTerm.set(t.id, []);
    for (const entry of termEntries) {
      byTerm.get(entry.termId)?.push(entry);
    }

    for (const [termId, entries] of byTerm) {
      if (entries.length === 0) continue;
      const t = terms.find(x => x.id === termId);
      const label = (t?.label || t?.term || termId).toUpperCase();

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

  private renderEntryCard(container: HTMLElement, entry: BaseEntry) {
    const fileName = entry.filePath.split("/").pop()?.replace(/\.md$/, "") ?? entry.filePath;
    const preview = this.extractPreview(entry.content);
    let expanded = false;

    const card = container.createDiv("surface-card");

    // Summary row (always visible)
    const summary = card.createDiv("surface-card-summary");

    const info = summary.createDiv("surface-card-info");
    info.createEl("span", { cls: "surface-card-title", text: fileName });
    if (preview) {
      info.createEl("span", { cls: "surface-card-preview", text: preview });
    }

    // CSS chevron
    const chevron = summary.createDiv("surface-chevron");
    chevron.setAttribute("aria-hidden", "true");

    // Jump button
    const jumpBtn = summary.createEl("button", {
      cls: "surface-jump-btn",
      text: "↗",
      attr: { "aria-label": "Open in note" },
    });
    jumpBtn.onclick = async (e) => {
      e.stopPropagation();
      const file = this.app.vault.getAbstractFileByPath(entry.filePath);
      if (!(file instanceof TFile)) return;
      const leaf = this.app.workspace.getLeaf();
      if (!leaf) return;
      await leaf.openFile(file);
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        view.editor.setCursor({ line: entry.lineNumber - 1, ch: 0 });
        view.editor.scrollIntoView(
          { from: { line: entry.lineNumber - 1, ch: 0 }, to: { line: entry.lineNumber - 1, ch: 0 } },
          true
        );
      }
    };

    // Expandable body — grid animation
    const body = card.createDiv("surface-card-body");
    const bodyInner = body.createDiv("surface-card-body-inner");

    summary.onclick = async () => {
      if (bodyInner.childElementCount === 0) {
        if (entry.content) {
          await MarkdownRenderer.render(this.app, entry.content, bodyInner, entry.filePath, this.component);
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

  private isInSelection(date: Date): boolean {
    if (this.filterMode === "day")  return isSameDay(date, this.referenceDate);
    if (this.filterMode === "week") return isSameWeek(date, this.referenceDate);
    return isSameMonth(date, this.referenceDate);
  }

  private dateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private formatDateHeading(d: Date): string {
    return d.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    }).toUpperCase();
  }

  private extractPreview(content: string): string {
    const line = content.split("\n").find(l => l.trim().length > 0) ?? "";
    const clean = line.replace(/^[#>\-*_`\s]+/, "").trim();
    return clean.length > 72 ? clean.slice(0, 72) + "\u2026" : clean;
  }

  private isReferenceDateStale(now: Date): boolean {
    if (this.filterMode === "pinned") return false;
    if (this.filterMode === "day") return !isSameDay(this.referenceDate, now);
    if (this.filterMode === "week") return !isSameWeek(this.referenceDate, now);
    return !isSameMonth(this.referenceDate, now);
  }

  private async syncReferenceDateToNowIfStale() {
    const now = new Date();
    if (!this.isReferenceDateStale(now)) return;
    this.referenceDate = now;
    await this.render();
  }
}
