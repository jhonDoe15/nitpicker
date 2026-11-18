import type { LabeledHunk } from '../patch/select-hunks.mts';
import type { ProjectNames } from './reflected-names.mts';

type Decline = (entry: LabeledHunk, names: ProjectNames) => boolean;

const DECLARED_METHOD = /^\s*(?:@\S+\s+)*(?:[\w$<>[\],.?]+\s+)+([A-Za-z_$][\w$]*)\s*\(/u;
const NOT_TYPES = /(?:^|\s)(?:return|new|throw|else|case)\s+[A-Za-z_$][\w$]*\s*\($/u;
const DECLARED_TYPE = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/gu;
const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'synchronized',
  'return',
  'new',
  'super',
  'this',
]);

function removedTexts({ hunk }: LabeledHunk): string[] {
  return hunk.lines.filter(({ kind }) => kind === '-').map(({ text }) => text);
}

function namesIn(texts: readonly string[], pattern: RegExp): string[] {
  return texts
    .flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1] ?? ''))
    .filter((name) => name !== '' && !KEYWORDS.has(name));
}

function removesQuotedName(pattern: RegExp): Decline {
  return (entry, { quoted }) => namesIn(removedTexts(entry), pattern).some(quoted);
}

function removesQuotedMethod(entry: LabeledHunk, { quoted }: ProjectNames): boolean {
  const declared = removedTexts(entry)
    .map((text) => DECLARED_METHOD.exec(text))
    .find(
      (match) => match !== null && !NOT_TYPES.test(match[0]) && !KEYWORDS.has(match[1] ?? ''),
    )?.[1];
  return declared === undefined || quoted(declared);
}

const DECLINES: ReadonlyMap<string, Decline> = new Map([
  ['UnusedMethod', removesQuotedMethod],
  ['UnusedNestedClass', removesQuotedName(DECLARED_TYPE)],
]);

export function isDeclined(entry: LabeledHunk, names: ProjectNames): boolean {
  return DECLINES.get(entry.label)?.(entry, names) ?? false;
}
