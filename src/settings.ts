import {
  App,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  type SettingDefinitionItem,
  type SettingGroupItem,
} from "obsidian";
import type SurfacePlugin from "./main";
import { BUILTIN_PATTERN_DEFS, createTermId } from "./patterns";

export * from "./patterns";

// ---------------------------------------------------------------------------
// Settings tab UI

export class SurfaceSettingTab extends PluginSettingTab {
  plugin: SurfacePlugin;
  private saveTimer: number | null = null;

  constructor(app: App, plugin: SurfacePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: "Built-in date formats",
        items: [
          {
            name: "",
            desc: "Toggle which heading formats surface will recognize as dates. All formats support optional ordinal suffixes (1st, 2nd, 3rd...).",
            searchable: false,
          },
          ...BUILTIN_PATTERN_DEFS.map((def): SettingGroupItem => ({
            name: def.label,
            desc: `Example: ${def.example}`,
            control: { type: "toggle", key: `pattern:${def.id}` },
          })),
        ],
      },
      {
        type: "list",
        heading: "Keyword terms",
        emptyState:
          "Any heading containing a term will appear in the pinned tab. The label is shown as the group header.",
        addItem: {
          name: "Add term",
          action: () => {
            this.plugin.settings.surfaceTerms.push({
              id: createTermId(),
              label: "",
              term: "",
            });
            void this.plugin.saveSettings();
            this.refreshDeclarativeList();
          },
        },
        onDelete: (index) => {
          this.plugin.settings.surfaceTerms.splice(index, 1);
          void this.plugin.saveSettings();
          this.refreshDeclarativeList();
        },
        onReorder: (oldIndex, newIndex) => {
          const terms = this.plugin.settings.surfaceTerms;
          const [moved] = terms.splice(oldIndex, 1);
          terms.splice(newIndex, 0, moved);
          void this.plugin.saveSettings();
        },
        items: this.plugin.settings.surfaceTerms.map((t, index) => ({
          name: t.label || t.term || "New term",
          aliases: t.term ? [t.term] : undefined,
          render: (setting: Setting) => {
            this.addTermInputs(setting, index);
          },
        })),
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key.startsWith("pattern:")) {
      return this.plugin.settings.builtinPatterns[key.slice("pattern:".length)] ?? false;
    }
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key.startsWith("pattern:")) {
      this.plugin.settings.builtinPatterns[key.slice("pattern:".length)] = value === true;
      await this.plugin.saveSettings();
    }
  }

  private refreshDeclarativeList(): void {
    if (requireApiVersion("1.13.0")) {
      this.update();
    }
  }

  // Fallback for Obsidian < 1.13.0, which has no declarative settings API.
  display(): void {
    this.renderLegacy();
  }

  private renderLegacy(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Built-in date formats").setHeading();
    new Setting(containerEl).setDesc(
      "Toggle which heading formats surface will recognize as dates. All formats support optional ordinal suffixes (1st, 2nd, 3rd...)."
    );

    for (const def of BUILTIN_PATTERN_DEFS) {
      new Setting(containerEl)
        .setName(def.label)
        .setDesc(`Example: ${def.example}`)
        .addToggle((toggle) =>
          toggle
            .setValue(this.plugin.settings.builtinPatterns[def.id] ?? false)
            .onChange(async (value) => {
              this.plugin.settings.builtinPatterns[def.id] = value;
              await this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl).setName("Keyword terms").setHeading();

    const terms = this.plugin.settings.surfaceTerms;
    if (terms.length === 0) {
      new Setting(containerEl).setDesc(
        "Any heading containing a term will appear in the pinned tab. The label is shown as the group header."
      );
    }

    terms.forEach((_, index) => {
      const setting = new Setting(containerEl);
      this.addTermInputs(setting, index);
      setting
        .addExtraButton((btn) =>
          btn
            .setIcon("arrow-up")
            .setTooltip("Move up")
            .setDisabled(index === 0)
            .onClick(async () => {
              const [moved] = terms.splice(index, 1);
              terms.splice(index - 1, 0, moved);
              await this.plugin.saveSettings();
              this.renderLegacy();
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("arrow-down")
            .setTooltip("Move down")
            .setDisabled(index === terms.length - 1)
            .onClick(async () => {
              const [moved] = terms.splice(index, 1);
              terms.splice(index + 1, 0, moved);
              await this.plugin.saveSettings();
              this.renderLegacy();
            })
        )
        .addExtraButton((btn) =>
          btn
            .setIcon("trash")
            .setTooltip("Delete")
            .onClick(async () => {
              terms.splice(index, 1);
              await this.plugin.saveSettings();
              this.renderLegacy();
            })
        );
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add term")
        .setCta()
        .onClick(async () => {
          terms.push({ id: createTermId(), label: "", term: "" });
          await this.plugin.saveSettings();
          this.renderLegacy();
        })
    );
  }

  hide(): void {
    this.flushDebouncedSave();
  }

  private addTermInputs(setting: Setting, index: number): void {
    const t = this.plugin.settings.surfaceTerms[index];

    setting
      .addText((text) =>
        text
          .setPlaceholder("Label (e.g. Important)")
          .setValue(t.label)
          .onChange((value) => {
            this.plugin.settings.surfaceTerms[index].label = value;
            this.scheduleSave();
          })
      )
      .addText((text) =>
        text
          .setPlaceholder("Term to match (e.g. Important)")
          .setValue(t.term)
          .onChange((value) => {
            this.plugin.settings.surfaceTerms[index].term = value;
            this.scheduleSave();
          })
      );
  }

  private scheduleSave() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
    }
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      void this.plugin.saveSettings();
    }, 300);
  }

  private flushDebouncedSave() {
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.plugin.saveSettings();
    }
  }
}
