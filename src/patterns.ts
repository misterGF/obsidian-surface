// Pattern definitions and settings data model. Must stay free of "obsidian"
// imports: the package is types-only, and tests import this module at runtime.

// Runtime pattern used by the parser
export interface ActivePattern {
  regex: RegExp;
  toDate: (match: RegExpMatchArray) => Date | null;
}

// A keyword term — headings containing this text are surfaced in the Pinned tab
export interface SurfaceTerm {
  id: string;
  label: string; // display name shown as group header
  term: string;  // text to match against heading content (case-insensitive substring)
}

export interface SurfaceSettings {
  builtinPatterns: Record<string, boolean>;
  surfaceTerms: SurfaceTerm[];
}

// ---------------------------------------------------------------------------
// Shared helpers

const LONG_MONTH: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

const SHORT_MONTH: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function createValidatedDate(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 0 || month > 11) return null;
  if (day < 1 || day > 31) return null;
  const date = new Date(year, month, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

// ---------------------------------------------------------------------------
// Built-in pattern definitions (regex matches the heading text AFTER "### ")

export const BUILTIN_PATTERN_DEFS: Array<{
  id: string;
  label: string;
  example: string;
  regex: RegExp;
  toDate: (m: RegExpMatchArray) => Date | null;
}> = [
  {
    id: "long-month-day-year",
    label: "Month D, YYYY",
    example: "March 4th, 2026 / April 23rd, 2026",
    regex: /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i,
    toDate(m) {
      const month = LONG_MONTH[m[1].toLowerCase()];
      if (month === undefined) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[2], 10));
    },
  },
  {
    id: "iso-date",
    label: "YYYY-MM-DD",
    example: "2026-04-24",
    regex: /^(\d{4})-(\d{2})-(\d{2})$/,
    toDate(m) {
      return createValidatedDate(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    },
  },
  {
    id: "us-short",
    label: "MM/DD/YYYY",
    example: "04/24/2026",
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    toDate(m) {
      return createValidatedDate(parseInt(m[3], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
    },
  },
  {
    id: "day-month-year",
    label: "D Month YYYY",
    example: "4th March 2026 / 23rd April 2026",
    regex: /^(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})$/i,
    toDate(m) {
      const month = LONG_MONTH[m[2].toLowerCase()];
      if (month === undefined) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[1], 10));
    },
  },
  {
    id: "short-month",
    label: "Mon D, YYYY",
    example: "Mar 4th, 2026 / Apr 23rd, 2026",
    regex: /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:st|nd|rd|th)?,\s+(\d{4})$/i,
    toDate(m) {
      const month = SHORT_MONTH[m[1].toLowerCase()];
      if (month === undefined) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[2], 10));
    },
  },
  {
    id: "day-short-month-year",
    label: "D Mon YYYY",
    example: "4th Mar 2026 / 23rd Apr 2026",
    regex: /^(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i,
    toDate(m) {
      const month = SHORT_MONTH[m[2].toLowerCase()];
      if (month === undefined) return null;
      return createValidatedDate(parseInt(m[3], 10), month, parseInt(m[1], 10));
    },
  },
];

const DEFAULT_ENABLED_PATTERNS = new Set(["long-month-day-year", "iso-date"]);

export const DEFAULT_SETTINGS: SurfaceSettings = {
  builtinPatterns: Object.fromEntries(
    BUILTIN_PATTERN_DEFS.map((p): [string, boolean] => [p.id, DEFAULT_ENABLED_PATTERNS.has(p.id)])
  ),
  surfaceTerms: [],
};

export function createTermId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `term-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Build the active pattern list the parser will use at runtime

export function buildActivePatterns(settings: SurfaceSettings): ActivePattern[] {
  const patterns: ActivePattern[] = [];
  for (const def of BUILTIN_PATTERN_DEFS) {
    if (settings.builtinPatterns[def.id]) {
      patterns.push({ regex: def.regex, toDate: def.toDate });
    }
  }
  return patterns;
}
