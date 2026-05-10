# Surface - Obsidian Plugin

Surface your notes without leaving your workflow. Write under date headings like `### March 4, 2026` and browse them by day, week, or month in a dedicated sidebar panel. Or define your own terms - words like `Important` or `Follow Up` - and Surface collects every heading that contains them, always visible in the Pinned tab.

![Surace screenshot](/assets/surface-screenshot.png)

---

## How It Works

Surface has two modes that work independently and can be used together.

### Date entries

Surface scans every markdown file in your vault for headings that match one of the enabled date formats. Everything written below that heading - until the next heading of equal or higher level - is treated as the entry's content and shown when you navigate to that date.

**Example note:**

```markdown
# Work Journal

### March 4, 2026
Finished the auth refactor. Opened PR #42.

### March 5, 2026
Code review for Sarah's branch. Standup at 10am.
```

Surface finds both entries and surfaces them when you navigate to those dates.

### Surface terms (Pinned tab)

Define keywords in Settings and Surface will collect any heading in your vault that contains that word, regardless of date. Those entries appear in the **Pinned** tab, grouped by term.

**Example note:**

```markdown
# Work Journal

### March 4, 2026

#### Important
The auth approach we chose has implications for the mobile team - loop them in before the next sprint.

#### Follow Up
Check in with Sarah about the deployment timeline.
```

If you have `Important` and `Follow Up` configured as surface terms, both headings appear in the Pinned tab instantly - no searching, no hunting.

---

## Installation

1. Copy the following files into your vault's plugin directory:
   ```
   <YourVault>/.obsidian/plugins/obsidian-surface/
     main.js
     manifest.json
     styles.css
   ```
2. In Obsidian, go to **Settings > Community Plugins**.
3. Turn off **Safe Mode** if prompted.
4. Find **Surface** in the list and enable it.

---

## Usage

Open the Surface panel via:
- The **calendar icon** in the left ribbon, or
- The command palette: `Surface: Open Surface view`

The panel opens in the right sidebar.

### Controls

| Control | Description |
|---|---|
| **Day / Week / Month** tabs | Browse date entries by granularity |
| **Pinned** tab | View all headings matching your surface terms |
| **← →** arrows | Navigate back or forward (date modes only) |

### Entry Cards

Each entry is displayed as a card showing:
- The **file** it came from
- A **preview** of the content below the heading
- Expandable **rendered markdown** on click
- An **↗ jump button** to open the file and scroll directly to that heading

---

## Date Formats

Surface ships with six built-in date formats. Toggle them individually in Settings.

| Format | Example |
|---|---|
| Month D, YYYY | `March 4th, 2026` |
| YYYY-MM-DD | `2026-03-04` |
| MM/DD/YYYY | `03/04/2026` |
| D Month YYYY | `4th March 2026` |
| Mon D, YYYY | `Mar 4th, 2026` |
| D Mon YYYY | `4th Mar 2026` |

All formats support optional ordinal suffixes (`1st`, `2nd`, `3rd`, `4th`...). The heading level (`#` count) does not matter - any level is recognized.

---

## Surface Terms

Surface terms are plain text keywords. Any heading whose text contains the term (case-insensitive) is collected into the Pinned tab.

Go to **Settings > Surface > Surface terms** to add terms. Each term has two fields:

| Field | Purpose |
|---|---|
| **Label** | The group header shown in the Pinned tab (e.g. `Important`) |
| **Term** | The text matched against heading content (e.g. `Important`) |

Label and term can differ - for example, label `Action Items` matched by term `TODO`.

Terms are matched as substrings, so `follow` matches `### Follow Up`, `### Follow-up needed`, and `### Things to follow`.

---

## How Obsidian Plugins Work

This section is a primer for anyone new to Obsidian plugin development. Surface is a good reference implementation because it uses the three most common building blocks.

### The Big Picture

Obsidian is an Electron app, which means plugins run as Node.js/browser JavaScript inside a sandboxed environment. Plugins are loaded from a vault's `.obsidian/plugins/<plugin-id>/` folder. Each plugin needs exactly three files to run:

| File | Purpose |
|---|---|
| `manifest.json` | Tells Obsidian the plugin's ID, name, version, and min app version |
| `main.js` | The compiled plugin code (a single CommonJS bundle) |
| `styles.css` | Optional stylesheet, auto-injected into the app when the plugin loads |

The plugin API is exposed via the `obsidian` module, which Obsidian provides at runtime. You never bundle it - it's listed as an external in the build config.

### Plugin Lifecycle

Every plugin exports a default class that extends `Plugin`. Obsidian calls two lifecycle hooks:

```ts
export default class MyPlugin extends Plugin {
  async onload() {
    // Called when the plugin is enabled.
    // Register views, commands, event listeners, etc. here.
  }

  onunload() {
    // Called when the plugin is disabled or Obsidian closes.
    // Clean up anything that won't be garbage collected automatically.
  }
}
```

Everything you register inside `onload` (views, commands, event listeners) is automatically cleaned up by Obsidian when the plugin unloads, as long as you use the provided registration methods rather than raw DOM APIs.

### Key API Concepts

**`this.app`** is your entry point to everything. The most useful sub-objects:

| Object | What it gives you |
|---|---|
| `app.vault` | Read, write, and list files in the vault |
| `app.workspace` | Open files, manage leaves/panels, get the active editor |
| `app.metadataCache` | Parsed frontmatter and cached file metadata |

**Commands** add entries to the command palette (Cmd/Ctrl+P):

```ts
this.addCommand({
  id: "my-command",
  name: "Do something",
  callback: () => { /* ... */ },
});
```

**Ribbon icons** add a clickable icon to the left sidebar:

```ts
this.addRibbonIcon("icon-name", "Tooltip text", () => { /* ... */ });
```

Icon names come from Obsidian's built-in Lucide icon set.

### Views (Sidebar Panels)

A `ItemView` is a panel that lives in a workspace leaf (a tab slot). You register a view type, then open it by creating a leaf and setting its state:

```ts
// Register once in onload:
this.registerView("my-view-type", (leaf) => new MyView(leaf));

// Open it:
const leaf = this.app.workspace.getRightLeaf(false);
await leaf.setViewState({ type: "my-view-type", active: true });
```

Inside the view, `this.containerEl.children[1]` is the scrollable content area. You build the UI by calling DOM helper methods that Obsidian attaches to every `HTMLElement`:

```ts
const div = container.createDiv("my-css-class");
const btn = div.createEl("button", { text: "Click me" });
btn.onclick = () => { /* ... */ };
```

To render markdown strings into a DOM element, use `MarkdownRenderer.render`:

```ts
await MarkdownRenderer.render(this.app, markdownString, targetEl, sourcePath, component);
```

The `component` argument (a `Component` instance) is used for lifecycle tracking - pass `this` from a view, or create a standalone `new Component()` and call `.load()` / `.unload()` yourself.

### Reading Vault Files

```ts
const files = this.app.vault.getMarkdownFiles(); // TFile[]
const content = await this.app.vault.cachedRead(file); // fast, uses cache
const content = await this.app.vault.read(file);       // always reads disk
```

`cachedRead` is preferred for display purposes. Use `vault.read` only when you need guaranteed freshness before writing.

### Styling

`styles.css` is auto-loaded. Obsidian exposes a full set of CSS variables for colors, spacing, and typography so your plugin respects the user's theme automatically:

```css
.my-element {
  color: var(--text-normal);
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
}
```

Never hardcode colors. The full variable reference is in the Obsidian developer docs.

### Build Tooling

Obsidian plugins must be compiled to a single CommonJS `main.js`. The standard setup uses esbuild:

```js
// esbuild.config.mjs
await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", ...builtins], // never bundle the obsidian module
  format: "cjs",
  outfile: "main.js",
});
```

TypeScript is optional but strongly recommended - the `obsidian` npm package ships full type definitions.

### Further Reading

- [Obsidian Plugin Developer Docs](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin)
- [Obsidian API type definitions](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)
- [Community plugin samples](https://github.com/obsidianmd/obsidian-sample-plugin)

---

## Development

```bash
# Install dependencies
npm install

# Watch mode (with inline source maps)
npm run dev

# Production build
npm run build
```

Built with [esbuild](https://esbuild.github.io/). TypeScript source lives in `src/`.

| File | Purpose |
|---|---|
| `src/main.ts` | Plugin entry point, vault scanning, entry caching |
| `src/view.ts` | Sidebar panel UI - date view, pinned view, entry cards |
| `src/parser.ts` | Date heading parser, term matcher, date comparison utilities |
| `src/settings.ts` | Settings types, built-in date patterns, settings tab UI |
| `styles.css` | Panel styles (uses Obsidian CSS variables) |
| `manifest.json` | Plugin metadata |
