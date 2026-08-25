import type { ActivePattern, SurfaceTerm } from "./settings";

export interface BaseEntry {
  headingText: string;
  content: string;
  filePath: string;
  lineNumber: number;
}

export interface DateEntry extends BaseEntry {
  date: Date;
}

export interface TermEntry extends BaseEntry {
  termId: string;
  termLabel: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

// Marks lines that can never be headings: YAML frontmatter and fenced code
function computeMaskedLines(lines: string[]): boolean[] {
  const masked = new Array<boolean>(lines.length).fill(false);
  let i = 0;

  if (lines[0]?.trim() === "---") {
    masked[0] = true;
    i = 1;
    while (i < lines.length) {
      masked[i] = true;
      const t = lines[i].trim();
      i++;
      if (t === "---" || t === "...") break;
    }
  }

  let openFence: string | null = null;
  for (; i < lines.length; i++) {
    const m = lines[i].match(FENCE_RE);
    if (openFence === null) {
      if (m) {
        openFence = m[1];
        masked[i] = true;
      }
    } else {
      masked[i] = true;
      const closes =
        m !== null &&
        m[1][0] === openFence[0] &&
        m[1].length >= openFence.length &&
        lines[i].trim() === m[1];
      if (closes) openFence = null;
    }
  }

  return masked;
}

export function parseEntries(
  content: string,
  filePath: string,
  patterns: ActivePattern[]
): DateEntry[] {
  if (patterns.length === 0) return [];

  const lines = content.split("\n");
  const masked = computeMaskedLines(lines);
  const entries: DateEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (masked[i]) continue;
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) continue;

    const [, hashes, headingText] = headingMatch;

    // Try each active pattern against the heading text
    let date: Date | null = null;
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
      content: collectContent(lines, i, hashes.length, masked),
      filePath,
      lineNumber: i + 1,
    });
  }

  return entries;
}

export function parseTermEntries(
  content: string,
  filePath: string,
  terms: SurfaceTerm[]
): TermEntry[] {
  if (terms.length === 0) return [];

  const lines = content.split("\n");
  const masked = computeMaskedLines(lines);
  const entries: TermEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (masked[i]) continue;
    const headingMatch = lines[i].match(HEADING_RE);
    if (!headingMatch) continue;

    const [, hashes, headingText] = headingMatch;
    const lower = headingText.toLowerCase();

    for (const t of terms) {
      if (!t.term || !lower.includes(t.term.toLowerCase())) continue;

      entries.push({
        headingText: lines[i].trim(),
        content: collectContent(lines, i, hashes.length, masked),
        filePath,
        lineNumber: i + 1,
        termId: t.id,
        termLabel: t.label || t.term,
      });
      break; // one match per heading is enough
    }
  }

  return entries;
}

function collectContent(
  lines: string[],
  headingIndex: number,
  level: number,
  masked: boolean[]
): string {
  const out: string[] = [];
  let j = headingIndex + 1;
  while (j < lines.length) {
    if (!masked[j]) {
      const next = lines[j].match(/^(#{1,6})\s/);
      if (next && next[1].length <= level) break;
    }
    out.push(lines[j]);
    j++;
  }
  return out.join("\n").trim();
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function isSameWeek(a: Date, b: Date): boolean {
  const startOfWeek = (d: Date) => {
    const copy = new Date(d);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
