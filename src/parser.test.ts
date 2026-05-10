import test from "node:test";
import assert from "node:assert/strict";
import { parseEntries, isSameWeek } from "./parser";
import type { ActivePattern } from "./settings";

test("parseEntries rejects invalid calendar dates", () => {
  const patterns: ActivePattern[] = [
    {
      regex: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i,
      toDate(match) {
        const monthNames: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
        };
        const month = monthNames[match[1].toLowerCase()];
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
      },
    },
    {
      regex: /^(\d{4})-(\d{2})-(\d{2})$/,
      toDate(match) {
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
      },
    },
    {
      regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
      toDate(match) {
        const month = parseInt(match[1], 10) - 1;
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const d = new Date(year, month, day);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
      },
    },
  ];

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

  const entries = parseEntries(content, "note.md", patterns);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].headingText, "### April 30, 2026");
});

test("isSameWeek uses Monday as week start", () => {
  const monday = new Date(2026, 4, 11); // Mon
  const sundayBefore = new Date(2026, 4, 10); // Sun
  const sundayAfter = new Date(2026, 4, 17); // Sun

  assert.equal(isSameWeek(monday, sundayBefore), false);
  assert.equal(isSameWeek(monday, sundayAfter), true);
});
