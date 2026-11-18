import type { LabeledHunk } from '../patch/select-hunks.mts';
import type { ProjectNames } from './reflected-names.mts';

type Decline = (entry: LabeledHunk, names: ProjectNames) => boolean;

const DECLARED_METHOD = /^\s*(?:@\S+\s+)*(?:[\w$<>[\],.?]+\s+)+([A-Za-z_$][\w$]*)\s*\(/u;
const NOT_TYPES = /(?:^|\s)(?:return|new|throw|else|case)\s+[A-Za-z_$][\w$]*\s*\($/u;
const DECLARED_FIELD = /([A-Za-z_$][\w$]*)\s*(?:=|;|,)/gu;
const ADDED_CONSTRUCTOR = /\bprivate\s+([A-Za-z_$][\w$]*)\s*\(\s*\)/gu;
const DECLARED_TYPE = /\b(?:class|interface|enum|record)\s+([A-Za-z_$][\w$]*)/gu;
const ARRAY_START = /\bnew\s[\w$.<>?,\s]*\[\]\s*\{/gu;
const QUOTED = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gu;
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

function textsOf({ hunk }: LabeledHunk, wanted: string): string[] {
  return hunk.lines.filter(({ kind }) => kind === wanted).map(({ text }) => text);
}

function removedTexts(entry: LabeledHunk): string[] {
  return textsOf(entry, '-');
}

function namesIn(texts: readonly string[], pattern: RegExp): string[] {
  return texts
    .flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1] ?? ''))
    .filter((name) => name !== '' && !KEYWORDS.has(name));
}

function removesQuotedName(pattern: RegExp): Decline {
  return (entry, { quoted }) => namesIn(removedTexts(entry), pattern).some(quoted);
}

function closesExtendedClass(entry: LabeledHunk, { extended }: ProjectNames): boolean {
  return namesIn(textsOf(entry, '+'), ADDED_CONSTRUCTOR).some(extended);
}

function depthOf(character: string): number {
  return ('([{'.includes(character) ? 1 : 0) - (')]}'.includes(character) ? 1 : 0);
}

function topLevelParts(text: string, open: number): string[] | undefined {
  const parts = [''];
  let depth = 0;
  for (const character of text.slice(open + 1).split('')) {
    depth += depthOf(character);
    if (depth < 0) {
      return parts;
    }
    if (depth === 0 && character === ',') {
      parts.push('');
    } else {
      parts.push(`${parts.pop() ?? ''}${character}`);
    }
  }
  return undefined;
}

function elementsAfter(text: string, open: number): number {
  return topLevelParts(text, open)?.filter((part) => part.trim() !== '').length ?? -1;
}

function dropsArrayOfOne(entry: LabeledHunk): boolean {
  const removed = removedTexts(entry).join('\n').replaceAll(QUOTED, '""');
  return [...removed.matchAll(ARRAY_START)].some(
    (match) => elementsAfter(removed, match.index + match[0].length - 1) === 1,
  );
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
  ['ExplicitArrayForVarargs', dropsArrayOfOne],
  ['FieldCanBeFinal', removesQuotedName(DECLARED_FIELD)],
  ['PrivateConstructorForUtilityClass', closesExtendedClass],
]);

export function isDeclined(entry: LabeledHunk, names: ProjectNames): boolean {
  return DECLINES.get(entry.label)?.(entry, names) ?? false;
}
