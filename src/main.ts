import { Plugin } from "obsidian";
import { SurfaceView, VIEW_TYPE } from "./view";
import { DateEntry, TermEntry, parseEntries, parseTermEntries } from "./parser";
import {
  SurfaceSettings,
  DEFAULT_SETTINGS,
  buildActivePatterns,
  SurfaceSettingTab,
} from "./settings";

export default class SurfacePlugin extends Plugin {
  settings!: SurfaceSettings;
  private entriesCache: DateEntry[] | null = null;
  private termEntriesCache: TermEntry[] | null = null;

  async onload() {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new SurfaceView(leaf, this));

    this.addRibbonIcon("calendar-search", "Surface", async () => {
      await this.activateView();
    });

    this.addCommand({
      id: "open-side-menu",
      name: "Open side menu",
      callback: () => this.activateView(),
    });

    this.addSettingTab(new SurfaceSettingTab(this.app, this));

    // Invalidate entry caches when vault files change
    const invalidate = () => {
      this.entriesCache = null;
      this.termEntriesCache = null;
    };
    this.registerEvent(this.app.vault.on("modify", invalidate));
    this.registerEvent(this.app.vault.on("create", invalidate));
    this.registerEvent(this.app.vault.on("delete", invalidate));
  }

  onunload() {
    // Leaves are preserved so users keep their layout on reload
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<SurfaceSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
    // Ensure any new built-in pattern keys exist (plugin updates)
    for (const key of Object.keys(DEFAULT_SETTINGS.builtinPatterns)) {
      if (this.settings.builtinPatterns[key] === undefined) {
        this.settings.builtinPatterns[key] = DEFAULT_SETTINGS.builtinPatterns[key];
      }
    }
    // Migrate legacy customPatterns field — no longer used
    if (!this.settings.surfaceTerms) {
      this.settings.surfaceTerms = [];
    }
  }

  async saveSettings() {
    this.entriesCache = null;
    this.termEntriesCache = null;
    await this.saveData(this.settings);
  }

  async getEntries(): Promise<DateEntry[]> {
    if (this.entriesCache) return this.entriesCache;

    const patterns = buildActivePatterns(this.settings);
    const entries: DateEntry[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(...parseEntries(content, file.path, patterns));
    }

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    this.entriesCache = entries;
    return entries;
  }

  async getTermEntries(): Promise<TermEntry[]> {
    if (this.termEntriesCache) return this.termEntriesCache;

    const terms = this.settings.surfaceTerms.filter(t => t.term.trim().length > 0);
    const entries: TermEntry[] = [];
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
    const appWithSettings = this.app as typeof this.app & {
      setting?: {
        open?: () => void;
        openTabById?: (id: string) => void;
      };
    };

    appWithSettings.setting?.open?.();
    appWithSettings.setting?.openTabById?.(this.manifest.id);
  }
}
