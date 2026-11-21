import { RENAMED_IDENTITY_PREFIX } from '../exceptions/matching.mts';
import { evaluateDuplicates } from '../rules/duplicates.mts';
import { isBoilerplate } from './boilerplate.mts';
import { readProjectFile } from './files.mts';
import { isRepeatingShape } from './repetition.mts';
import type { Finding } from '../values/findings.mts';
import { fieldOf, fieldsOf, numberOr, optionalText, textOf } from '../values/readers.mts';

export type Clone = Readonly<Record<string, unknown>>;

type Side = { readonly file: string; readonly line: number; readonly [field: string]: unknown };
type Span = { readonly file: string; readonly from: number; readonly to: number };
type Located = Clone & { readonly first: Side; readonly second: Side; readonly fragment: string };

export type RenamedClone = Located & { readonly lines: number; readonly original: string };

type TestAdvice = { readonly isTestFile: (file: string) => boolean; readonly text: string };

const WHITESPACE = /\s+/gu;
const CLONE_MESSAGE = /^This code repeats (\S+?)(?::\d+)? \(\d+ lines\)\./u;
const KEEP_ONE_COPY = / Keep one copy and call it from both places\./u;

function sideOf(value: unknown): Side {
  return {
    ...fieldsOf(value),
    file: textOf(fieldOf(value, 'file')),
    line: numberOr(fieldOf(value, 'line'), Number.NaN),
  };
}

function span(side: Side, lines: number): Span {
  return { file: side.file, from: side.line, to: side.line + lines - 1 };
}

function touches(left: Span, right: Span): boolean {
  return left.file === right.file && left.from <= right.to && right.from <= left.to;
}

function spans(clone: Clone): readonly [Span, Span] {
  const lines = numberOr(clone['lines'], 1);
  return [span(sideOf(clone['first']), lines), span(sideOf(clone['second']), lines)];
}

function sameClone(clone: Clone, other: Clone): boolean {
  const [first, second] = spans(clone);
  const [otherFirst, otherSecond] = spans(other);
  return (
    (touches(first, otherFirst) && touches(second, otherSecond)) ||
    (touches(first, otherSecond) && touches(second, otherFirst))
  );
}

function byFilesAndShape(left: RenamedClone, right: RenamedClone): number {
  return (
    left.first.file.localeCompare(right.first.file) ||
    left.second.file.localeCompare(right.second.file) ||
    left.fragment.localeCompare(right.fragment) ||
    left.first.line - right.first.line
  );
}

function located(clone: Clone): Located {
  const first = sideOf(clone['first']);
  const second = sideOf(clone['second']);
  const swapped = first.file.localeCompare(second.file) || first.line - second.line;
  const fragment = (optionalText(clone['fragment']) ?? '').replace(WHITESPACE, '');
  return swapped > 0
    ? { ...clone, first: second, second: first, fragment }
    : { ...clone, first, second, fragment };
}

function originalLines(projectRoot: string, side: Side, lines: number): string[] {
  const text = readProjectFile(projectRoot, side.file);
  return text === undefined ? [] : text.split(/\r?\n/u).slice(side.line - 1, side.line - 1 + lines);
}

export function renamedClones(
  clones: readonly Clone[],
  { projectRoot, syntax }: { readonly projectRoot: string; readonly syntax: string },
): RenamedClone[] {
  return clones
    .map(located)
    .filter((clone) => !touches(...spans(clone)))
    .filter((clone) => !isRepeatingShape(clone.fragment))
    .map((clone) => ({ ...clone, lines: numberOr(clone['lines'], 1) }))
    .map((clone) => ({ ...clone, original: originalLines(projectRoot, clone.first, clone.lines) }))
    .filter((clone) => !isBoilerplate(clone.original, syntax))
    .map(({ original, ...clone }) => ({ ...clone, original: original.join('\n') }))
    .sort(byFilesAndShape);
}

export function withoutRenamedCopies<Item extends Clone>(
  plainClones: readonly Item[],
  renamed: readonly Clone[],
): Item[] {
  return plainClones.filter((clone) => !renamed.some((other) => sameClone(clone, other)));
}

function withTestAdvice(finding: Finding, { isTestFile, text }: TestAdvice): Finding {
  const other = CLONE_MESSAGE.exec(finding.message)?.[1];
  return other !== undefined && isTestFile(finding.path) && isTestFile(other)
    ? { ...finding, message: finding.message.replace(KEEP_ONE_COPY, () => ` ${text}`) }
    : finding;
}

export function renamedFindings(
  clones: readonly Clone[],
  analyzerName: string,
  testAdvice?: TestAdvice,
): Finding[] {
  return evaluateDuplicates(clones, analyzerName)
    .map((finding) => (testAdvice === undefined ? finding : withTestAdvice(finding, testAdvice)))
    .map((finding) => ({ ...finding, identity: `${RENAMED_IDENTITY_PREFIX}${finding.identity}` }));
}
