import test from "node:test";
import assert from "node:assert/strict";
import { parseEntries, parseTermEntries, isSameWeek } from "./parser";
import { BUILTIN_PATTERN_DEFS, DEFAULT_SETTINGS, buildActivePatterns } from "./patterns";

const ALL_PATTERNS = buildActivePatterns({
  builtinPatterns: Object.fromEntries(BUILTIN_PATTERN_DEFS.map(p => [p.id, true])),
  surfaceTerms: [],
});

void test("default settings enable long month and ISO formats", () => {
  const active = buildActivePatterns(DEFAULT_SETTINGS);
  assert.equal(active.length, 2);
  assert.ok(DEFAULT_SETTINGS.builtinPatterns["long-month-day-year"]);
  assert.ok(DEFAULT_SETTINGS.builtinPatterns["iso-date"]);
});

void test("every built-in pattern parses its own example", () => {
  for (const def of BUILTIN_PATTERN_DEFS) {
    for (const example of def.example.split(" / ")) {
      const entries = parseEntries(`## ${example}\nbody`, "note.md", [def]);
      assert.equal(entries.length, 1, `pattern ${def.id} failed on "${example}"`);
    }
  }
});

void test("short month patterns accept Sept and trailing periods", () => {
  const content = [
    "### Sept 30, 2026",
    "a",
    "### Sep. 29, 2026",
    "b",
    "### 28 Sept. 2026",
    "c",
    "### Dec. 1st, 2026",
    "d",
  ].join("\n");

  const entries = parseEntries(content, "note.md", ALL_PATTERNS);
  assert.deepEqual(
    entries.map(e => [e.date.getMonth(), e.date.getDate()]),
    [[8, 30], [8, 29], [8, 28], [11, 1]],
  );
});

void test("parseEntries rejects invalid calendar dates", () => {
  const content = [
    "### February 30, 2026",
    "bad",
    "### 2026-02-30",
    "bad",
    "### 04/31/2026",
    "bad",
    "### April 30, 2026",
    "good",
  ].join("\n");

  const entries = parseEntries(content, "note.md", ALL_PATTERNS);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].headingText, "### April 30, 2026");
});

void test("headings inside fenced code blocks are ignored", () => {
  const content = [
    "### 2026-01-02",
    "some text",
    "```sh",
    "# 2026-01-01",
    "echo hi",
    "```",
    "after the fence",
  ].join("\n");

  const entries = parseEntries(content, "note.md", ALL_PATTERNS);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].headingText, "### 2026-01-02");
  // The fenced "# ..." line must not terminate content collection
  assert.ok(entries[0].content.includes("after the fence"));
  assert.ok(entries[0].content.includes("echo hi"));
});

void test("tilde fences and unclosed fences are handled", () => {
  const content = [
    "~~~",
    "# 2026-01-01",
    "~~~",
    "### 2026-03-04",
    "body",
    "```",
    "# 2026-05-06",
  ].join("\n");

  const entries = parseEntries(content, "note.md", ALL_PATTERNS);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].headingText, "### 2026-03-04");
});

void test("YAML frontmatter is ignored", () => {
  const content = [
    "---",
    "title: note",
    "# 2026-01-01",
    "---",
    "### 2026-02-03",
    "body",
  ].join("\n");

  const entries = parseEntries(content, "note.md", ALL_PATTERNS);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].headingText, "### 2026-02-03");
});

void test("parseTermEntries matches case-insensitively and skips fences", () => {
  const terms = [{ id: "t1", label: "Important", term: "important" }];
  const content = [
    "## Very IMPORTANT thing",
    "details",
    "```",
    "## another important thing in code",
    "```",
  ].join("\n");

  const entries = parseTermEntries(content, "note.md", terms);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].termId, "t1");
  assert.equal(entries[0].termLabel, "Important");
  assert.ok(entries[0].content.includes("details"));
});

void test("isSameWeek uses Monday as week start", () => {
  const monday = new Date(2026, 4, 11); // Mon
  const sundayBefore = new Date(2026, 4, 10); // Sun
  const sundayAfter = new Date(2026, 4, 17); // Sun

  assert.equal(isSameWeek(monday, sundayBefore), false);
  assert.equal(isSameWeek(monday, sundayAfter), true);
});

void test("isSameWeek handles weeks spanning a year boundary", () => {
  const dec29 = new Date(2025, 11, 29); // Mon
  const jan4 = new Date(2026, 0, 4); // Sun, same ISO week
  const jan5 = new Date(2026, 0, 5); // Mon, next week

  assert.equal(isSameWeek(dec29, jan4), true);
  assert.equal(isSameWeek(dec29, jan5), false);
});
