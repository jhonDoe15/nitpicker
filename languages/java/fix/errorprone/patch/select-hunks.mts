import { wordIn } from '../../../adapters/near-duplicates/jvm-views.mts';
import { changedLines, hunkLines } from './hunk-edits.mts';
import type { Hunk, HunkLine } from './unified-diff.mts';

export type Touched = ReadonlySet<number> | 'all';
export type LabeledHunk = {
  readonly label: string;
  readonly hunk: Hunk;
  readonly line?: number;
  readonly group?: string;
};

const IMPORT_LINE = /^\s*import\s+(?:static\s+)?([\w.$]+?)(?:\.(\*|[\w$]+))?\s*;\s*$/u;
const BLANK = /^\s*$/u;

function changedTexts(hunk: Hunk): string[] {
  return hunk.lines.filter(({ kind }) => kind !== ' ').map(({ text }) => text);
}

function isImportOnly(hunk: Hunk): boolean {
  const texts = changedTexts(hunk);
  return (
    texts.length > 0 &&
    texts.every((text) => IMPORT_LINE.test(text) || BLANK.test(text)) &&
    texts.some((text) => IMPORT_LINE.test(text))
  );
}

function touches(hunk: Hunk, touched: Touched): boolean {
  return touched === 'all' || changedLines(hunk).some((line) => touched.has(line));
}

function importedName(text: string): string | undefined {
  const match = IMPORT_LINE.exec(text);
  return match === null ? undefined : (match[2] ?? match[1]?.split('.').at(-1));
}

function usedIn(name: string, texts: readonly string[]): boolean {
  return wordIn(name, texts, /(?<![\w$])/u);
}

function removedLines(hunk: Hunk): number[] {
  const removed: number[] = [];
  let line = hunk.oldStart;
  for (const { kind } of hunk.lines) {
    if (kind === '-') {
      removed.push(line);
    }
    line += kind === '+' ? 0 : 1;
  }
  return removed;
}

function finalTexts(text: string | undefined, kept: readonly Hunk[]): string[] | undefined {
  if (text === undefined) {
    return undefined;
  }
  const removed = new Set(kept.flatMap(removedLines));
  const left = text
    .split('\n')
    .filter((line, index) => !(removed.has(index + 1) || IMPORT_LINE.test(line)));
  const added = kept.flatMap(({ lines }) =>
    lines.filter(({ kind }) => kind === '+').map(({ text: line }) => line),
  );
  return [...left, ...added];
}

function keptLine(
  line: HunkLine,
  keptTexts: readonly string[],
  finalText: readonly string[] | undefined,
): boolean {
  const name = importedName(line.text);
  if (line.kind === '+') {
    return name !== undefined && (name === '*' || usedIn(name, keptTexts));
  }
  return (
    line.kind === ' ' ||
    (finalText !== undefined && name !== undefined && name !== '*' && !usedIn(name, finalText))
  );
}

function keptImports(
  hunk: Hunk,
  keptTexts: readonly string[],
  finalText: readonly string[] | undefined,
): Hunk | undefined {
  const lines = hunk.lines
    .filter((line) => line.kind !== '+' || keptLine(line, keptTexts, finalText))
    .map((line): HunkLine =>
      line.kind === '-' && !keptLine(line, keptTexts, finalText) ? { ...line, kind: ' ' } : line,
    );
  return lines.some(({ kind }) => kind !== ' ') ? { ...hunk, lines } : undefined;
}

function stillUnused(hunk: Hunk, finalText: readonly string[] | undefined): boolean {
  return (
    finalText === undefined ||
    hunk.lines
      .filter(({ kind }) => kind === '-')
      .map(({ text }) => importedName(text))
      .every((name) => name === undefined || name === '*' || !usedIn(name, finalText))
  );
}

export function selectHunks(
  entries: readonly LabeledHunk[],
  touched: Touched,
  text?: string,
): LabeledHunk[] {
  const importOnly = entries.filter(({ hunk }) => isImportOnly(hunk));
  const body = entries.filter((entry) => !importOnly.includes(entry));
  const touchedGroups = new Set(
    body
      .filter(({ hunk }) => touches(hunk, touched))
      .flatMap(({ group }) => (group === undefined ? [] : [group])),
  );
  const keptBody = body.filter(({ hunk, group }) =>
    group === undefined ? touches(hunk, touched) : touchedGroups.has(group),
  );
  const keptTexts = keptBody.flatMap(({ hunk }) => hunkLines(hunk).after);
  const finalText = finalTexts(
    text,
    keptBody.map(({ hunk }) => hunk),
  );
  const imports = importOnly.flatMap((entry): LabeledHunk[] => {
    const removes = entry.hunk.lines.some(({ kind }) => kind === '-');
    if (removes && touches(entry.hunk, touched) && stillUnused(entry.hunk, finalText)) {
      return [entry];
    }
    const hunk = touched === 'all' ? entry.hunk : keptImports(entry.hunk, keptTexts, finalText);
    return hunk === undefined ? [] : [{ ...entry, hunk }];
  });
  return [...imports, ...keptBody];
}
