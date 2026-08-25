import { debounce, Plugin } from "obsidian";
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
  // Promise-valued so an invalidation mid-scan discards that scan's result
  private entriesPromise: Promise<DateEntry[]> | null = null;
  private termEntriesPromise: Promise<TermEntry[]> | null = null;

  private refreshOpenViews = debounce(
    () => {
      for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
        if (leaf.view instanceof SurfaceView) void leaf.view.refresh();
      }
    },
    1000,
    true
  );

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

    // Registered after layout-ready because "create" fires per file on startup
    this.app.workspace.onLayoutReady(() => {
      const invalidate = () => {
        this.entriesPromise = null;
        this.termEntriesPromise = null;
        this.refreshOpenViews();
      };
      this.registerEvent(this.app.vault.on("modify", invalidate));
      this.registerEvent(this.app.vault.on("create", invalidate));
      this.registerEvent(this.app.vault.on("delete", invalidate));
      this.registerEvent(this.app.vault.on("rename", invalidate));
    });
  }

  onunload() {
    // Leaves are preserved so users keep their layout on reload
    this.refreshOpenViews.cancel();
  }

  async loadSettings() {
    const saved = (await this.loadData()) as Partial<SurfaceSettings> | null;
    this.settings = Object.assign(structuredClone(DEFAULT_SETTINGS), saved ?? {});
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
    this.entriesPromise = null;
    this.termEntriesPromise = null;
    await this.saveData(this.settings);
    this.refreshOpenViews();
  }

  getEntries(): Promise<DateEntry[]> {
    if (!this.entriesPromise) {
      const scan = this.scanEntries();
      this.entriesPromise = scan;
      scan.catch(() => {
        if (this.entriesPromise === scan) this.entriesPromise = null;
      });
    }
    return this.entriesPromise;
  }

  private async scanEntries(): Promise<DateEntry[]> {
    const patterns = buildActivePatterns(this.settings);
    const entries: DateEntry[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(...parseEntries(content, file.path, patterns));
    }

    entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return entries;
  }

  getTermEntries(): Promise<TermEntry[]> {
    if (!this.termEntriesPromise) {
      const scan = this.scanTermEntries();
      this.termEntriesPromise = scan;
      scan.catch(() => {
        if (this.termEntriesPromise === scan) this.termEntriesPromise = null;
      });
    }
    return this.termEntriesPromise;
  }

  private async scanTermEntries(): Promise<TermEntry[]> {
    const terms = this.settings.surfaceTerms.filter(t => t.term.trim().length > 0);
    const entries: TermEntry[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const content = await this.app.vault.cachedRead(file);
      entries.push(...parseTermEntries(content, file.path, terms));
    }

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
