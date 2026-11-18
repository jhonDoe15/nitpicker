import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../shared/rules/duplicates.mjs';
import { projectFile } from '../../../shared/ingest/common.mjs';
import { childrenNamed, parseXml, type XmlElement } from '../../../shared/values/xml.mts';
import { fieldOf, textOf } from '../../../shared/values/readers.mts';
import { LITERAL_OR_COMMENT } from '../ingest/source-text.mjs';
import {
  CPD_IDENTITY_PREFIX,
  cpdNotRun,
  readCpdReport,
  skippedPaths,
  type CpdFinding,
} from './cpd/cpd-report.mts';

type Side = {
  readonly file: string;
  readonly line: number;
  readonly endLine: number;
  readonly column?: number;
  readonly endColumn?: number;
};
type Clone = {
  readonly first: Side;
  readonly second: Side;
  readonly fragment: string;
  readonly shape: string;
  readonly lines: number;
  readonly tokens: number;
};
type CoveredClone = {
  readonly first: Pick<Side, 'file' | 'line'>;
  readonly second: Pick<Side, 'file' | 'line'>;
  readonly lines?: number;
};
type Range = Pick<Side, 'file' | 'line' | 'endLine'>;
type CoveredRanges = { readonly first: Range; readonly second: Range };
type Reportable = CpdFinding & { readonly location?: unknown };
type FindingsOptions = {
  readonly projectRoot: string;
  readonly sourceRoots?: readonly string[];
  readonly testRoots: readonly string[];
  readonly module?: unknown;
};

const evaluate: (clones: readonly Clone[], tool: string) => Reportable[] = evaluateDuplicates;
const projectFileOf: (root: string, file: string) => string | undefined = projectFile;
const literalOrComment: RegExp = LITERAL_OR_COMMENT;

const DUPLICATES_TOOL = 'duplicates';
const TEST_ADVICE =
  'Extract a helper, or fold the cases into one @ParameterizedTest. Keep one copy and call it from both places.';
const NOT_CONTROL = String.raw`(?!(?:else|if|for|while|switch|catch|try|do|synchronized|new|return|throw)\b)`;
const MODIFIERS = String.raw`(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)*`;
const BOILERPLATE_LINES = [
  /^[{}]*$/,
  /^@\w+(?:\(.*\))?$/,
  new RegExp(
    String.raw`^${NOT_CONTROL}${MODIFIERS}(?:[\w<>\[\],.?]+\s+)+\w+\s*\([^)]*\)\s*(?:throws [\w., ]*[\w.,]\s*)?\{$`,
  ),
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}[A-Z]\w*\s*\([^)]*\)\s*\{$`),
  new RegExp(String.raw`^${MODIFIERS}(?:class|interface|record|enum)\s+\w.*\{$`),
  /^return\s+(?:this\.)?\w+;$/,
  /^(?:this\.)?\w+\s*=\s*\w+;$/,
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}(?:[\w<>\[\],.?]+\s+)+\w+;$`),
];

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const NUMBER = /(?:\b\d|\.\d)(?:[eEpP][+-]|[\w.])*/g;
const WORD = /[\w$]+/g;
const DATA_LINES = [
  /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/,
  /^(?:Arguments\.)?(?:of|arguments)\(.*\)[,;]*$/,
  /^(?=.*\d)(?![\w.]+\()[\w.]*(?:[\s,;{}()[\]+-][\s\d.,;{}()[\]+-]*)?$/,
  /^[\s,;{}()[\]]+$/,
  /^(?:Map\.)?entry\([\w\s.,+-]*\)[,;)]*$/,
  new RegExp(
    String.raw`^(?:[\w<>,.?[\]]+\s+)+\w+\s*=\s*` +
      String.raw`(?:Map\.ofEntries|Map\.of|List\.of|Set\.of|Stream\.of|Arrays\.asList)\([\w\s.,()+-]*$`,
  ),
];

function codeLines(fragment: string): string[] {
  return fragment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function isAccessorOnly(fragment: string): boolean {
  return codeLines(fragment).every((line) =>
    BOILERPLATE_LINES.some((pattern) => pattern.test(line)),
  );
}

export function isDataTable(fragment: string): boolean {
  return codeLines(fragment).every((line) => {
    const withoutStrings = line.replace(STRING_LITERAL, '0');
    return [...BOILERPLATE_LINES, ...DATA_LINES].some((pattern) => pattern.test(withoutStrings));
  });
}

function fileRange(element: XmlElement, projectRoot: string): Side {
  const reported = textOf(element.attrs['path']);
  const relative = path.isAbsolute(reported) ? path.relative(projectRoot, reported) : reported;
  return {
    file: relative.split(path.sep).join('/').replaceAll('\\', '/'),
    line: Number(element.attrs['line']),
    endLine: Number(element.attrs['endline']),
    ...(element.attrs['column'] === undefined ? {} : { column: Number(element.attrs['column']) }),
    ...(element.attrs['endcolumn'] === undefined
      ? {}
      : { endColumn: Number(element.attrs['endcolumn']) }),
  };
}

type LineReader = (file: string) => readonly string[];

function lineReader(projectRoot: string): LineReader {
  const files = new Map<string, readonly string[]>();
  return (file) => {
    const known = files.get(file);
    if (known !== undefined) {
      return known;
    }
    const absolute = projectFileOf(projectRoot, file);
    const lines =
      absolute !== undefined && existsSync(absolute)
        ? readFileSync(absolute, 'utf8').split(/\r?\n/)
        : [];
    files.set(file, lines);
    return lines;
  };
}

function linesOf(readLines: LineReader, side: Side): string[] {
  return readLines(side.file).slice(side.line - 1, side.endLine);
}

function clonedText(lines: readonly string[], side: Side): string {
  const cut = [...lines];
  if (cut.length > 0 && side.endColumn !== undefined) {
    cut[cut.length - 1] = textOf(cut[cut.length - 1]).slice(0, side.endColumn - 1);
  }
  if (cut.length > 0 && side.column !== undefined) {
    cut[0] = textOf(cut[0]).slice(side.column - 1);
  }
  return cut.join('\n');
}

export function tokenShape(text: string): string {
  return text
    .replace(literalOrComment, ' ')
    .replace(NUMBER, ' ')
    .replace(WORD, ' ')
    .replace(/\s+/g, '');
}

function byFile(left: Pick<Side, 'file'>, right: Pick<Side, 'file'>): number {
  return left.file.localeCompare(right.file);
}

function cloneOf(
  duplication: XmlElement,
  readLines: LineReader,
  sides: readonly [Side, Side],
): Clone {
  const [first, second] = sides;
  const lines = linesOf(readLines, first);
  return {
    first,
    second,
    fragment: lines.join('\n'),
    shape: tokenShape(clonedText(lines, first)),
    lines: Number(duplication.attrs['lines']),
    tokens: Number(duplication.attrs['tokens']),
  };
}

function sidesOf(duplication: XmlElement, projectRoot: string): [Side, Side][] {
  const [first, ...others] = childrenNamed(duplication, 'file')
    .map((element) => fileRange(element, projectRoot))
    .sort(byFile);
  return first === undefined ? [] : others.map((other): [Side, Side] => [first, other]);
}

export function cpdClones(xml: string, projectRoot: string): Clone[] {
  const readLines = lineReader(projectRoot);
  return childrenNamed(parseXml(xml), 'duplication').flatMap((duplication) =>
    sidesOf(duplication, projectRoot).map((sides) => cloneOf(duplication, readLines, sides)),
  );
}

function byPairAndShape(left: Clone, right: Clone): number {
  return (
    [
      byFile(left.first, right.first),
      byFile(left.second, right.second),
      left.shape.localeCompare(right.shape),
    ].find((order) => order !== 0) ?? 0
  );
}

function overlaps(left: Range, right: Range): boolean {
  return left.file === right.file && left.line <= right.endLine && right.line <= left.endLine;
}

function sameClone(
  clone: Pick<Clone, 'first' | 'second'>,
  other: Pick<Clone, 'first' | 'second'>,
): boolean {
  return (
    (overlaps(clone.first, other.first) && overlaps(clone.second, other.second)) ||
    (overlaps(clone.first, other.second) && overlaps(clone.second, other.first))
  );
}

function isBoilerplate(clone: Clone): boolean {
  return clone.fragment !== '' && (isAccessorOnly(clone.fragment) || isDataTable(clone.fragment));
}

function distinctClones(clones: readonly Clone[]): Clone[] {
  const kept: Clone[] = [];
  for (const clone of clones) {
    if (!(overlaps(clone.first, clone.second) || kept.some((other) => sameClone(clone, other)))) {
      kept.push(clone);
    }
  }
  return kept;
}

function jscpdRange(side: Pick<Side, 'file' | 'line'>, lines: number | undefined): Range {
  return { file: side.file, line: side.line, endLine: side.line + (lines ?? 1) - 1 };
}

function cloneList(xml: string, projectRoot: string): Clone[] {
  return distinctClones(cpdClones(xml, projectRoot)).filter((clone) => !isBoilerplate(clone));
}

function readCpdRanges(reportRoot: string, projectRoot: string): CoveredRanges[] {
  const read = readCpdReport(reportRoot);
  return read.kind === 'report'
    ? childrenNamed(parseXml(read.xml), 'duplication').flatMap((duplication) =>
        sidesOf(duplication, projectRoot).map(([first, second]) => ({ first, second })),
      )
    : [];
}

export function coveredByCpd(
  modules: readonly unknown[],
  projectRoot: string,
): (clone: CoveredClone) => boolean {
  const cpdCloneList = modules.flatMap((module) =>
    readCpdRanges(textOf(fieldOf(module, 'reportRoot')), projectRoot),
  );
  return (clone) => {
    const range = {
      first: jscpdRange(clone.first, clone.lines),
      second: jscpdRange(clone.second, clone.lines),
    };
    return cpdCloneList.some((other) => sameClone(range, other));
  };
}

function withTestAdvice(finding: Reportable, testFiles: (file: string) => boolean): Reportable {
  const clone = /^This code repeats (\S+?)(?::\d+)?(?: \(\d+ lines\))?\./.exec(finding.message);
  const inTests = testFiles(finding.path) && clone !== null && testFiles(textOf(clone[1]));
  return inTests
    ? { ...finding, message: finding.message.replace(/ Keep one copy.*$/, ` ${TEST_ADVICE}`) }
    : finding;
}

export function readCpdFindings(
  reportRoot: string,
  { projectRoot, sourceRoots, testRoots, module }: FindingsOptions,
): Reportable[] {
  const read = readCpdReport(reportRoot);
  if (read.kind === 'missing') {
    return [];
  }
  if (read.kind === 'failed') {
    return [cpdNotRun(read.reason, [...(sourceRoots ?? []), ...testRoots], module)];
  }
  const clones = cloneList(read.xml, projectRoot);
  function inTests(file: string): boolean {
    return testRoots.some((root) => file.startsWith(`${root}/`));
  }
  const shaped = clones
    .map((clone) => ({ ...clone, fragment: clone.shape }))
    .sort((left, right) => byPairAndShape(left, right));
  const findings = evaluate(shaped, DUPLICATES_TOOL)
    .filter((finding) => finding.classification === 'enforceable')
    .map((finding) => withTestAdvice(finding, inTests))
    .map((finding) => ({
      ...finding,
      identity: `${CPD_IDENTITY_PREFIX}${finding.identity}`,
    }));
  return [...skippedPaths(reportRoot, { projectRoot, xml: read.xml }), ...findings];
}
