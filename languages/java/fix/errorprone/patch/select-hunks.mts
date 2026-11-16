import { escapeRegExp as untypedEscapeRegExp } from '../../../../../shared/paths/glob.mjs';
import { changedLines, hunkLines } from './hunk-edits.mts';
import type { Hunk, HunkLine } from './unified-diff.mts';

export type Touched = ReadonlySet<number> | 'all';
export type LabeledHunk = { readonly label: string; readonly hunk: Hunk; readonly line?: number };

const IMPORT_LINE = /^\s*import\s+(?:static\s+)?([\w.$]+?)(?:\.(\*|[\w$]+))?\s*;\s*$/u;
const BLANK = /^\s*$/u;
const escapeRegExp: (value: string) => string = untypedEscapeRegExp;

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
  const pattern = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, 'u');
  return texts.some((text) => pattern.test(text));
}

function keptAdditions(hunk: Hunk, keptTexts: readonly string[]): Hunk | undefined {
  const lines = hunk.lines
    .filter(({ kind, text }) => {
      const name = importedName(text);
      return kind !== '+' || (name !== undefined && (name === '*' || usedIn(name, keptTexts)));
    })
    .map((line): HunkLine => (line.kind === '-' ? { ...line, kind: ' ' } : line));
  return lines.some(({ kind }) => kind === '+') ? { ...hunk, lines } : undefined;
}

export function selectHunks(entries: readonly LabeledHunk[], touched: Touched): LabeledHunk[] {
  const importOnly = entries.filter(({ hunk }) => isImportOnly(hunk));
  const body = entries.filter((entry) => !importOnly.includes(entry));
  const keptBody = body.filter(({ hunk }) => touches(hunk, touched));
  const keptTexts = keptBody.flatMap(({ hunk }) => hunkLines(hunk).after);
  const imports = importOnly.flatMap((entry): LabeledHunk[] => {
    const removes = entry.hunk.lines.some(({ kind }) => kind === '-');
    if (removes && touches(entry.hunk, touched)) {
      return [entry];
    }
    const hunk = touched === 'all' ? entry.hunk : keptAdditions(entry.hunk, keptTexts);
    return hunk === undefined ? [] : [{ ...entry, hunk }];
  });
  return [...imports, ...keptBody];
}
