import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { evaluateDuplicates } from '../../../shared/rules/duplicates.mjs';
import { childrenNamed, parseXml, projectFile } from '../../../shared/ingest/common.mjs';
import { LITERAL_OR_COMMENT } from '../ingest/source-text.mjs';
import { CPD_IDENTITY_PREFIX, cpdNotRun, readCpdReport, skippedPaths } from './cpd/cpd-report.mjs';

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

function codeLines(fragment) {
  return fragment
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export function isAccessorOnly(fragment) {
  return codeLines(fragment).every((line) =>
    BOILERPLATE_LINES.some((pattern) => pattern.test(line)),
  );
}

export function isDataTable(fragment) {
  return codeLines(fragment).every((line) => {
    const withoutStrings = line.replace(STRING_LITERAL, '0');
    return [...BOILERPLATE_LINES, ...DATA_LINES].some((pattern) => pattern.test(withoutStrings));
  });
}

function fileRange(element, projectRoot) {
  const reported = element.attrs.path;
  const relative = path.isAbsolute(reported) ? path.relative(projectRoot, reported) : reported;
  return {
    file: relative.split(path.sep).join('/').replaceAll('\\', '/'),
    line: Number(element.attrs.line),
    endLine: Number(element.attrs.endline),
    ...(element.attrs.column === undefined ? {} : { column: Number(element.attrs.column) }),
    ...(element.attrs.endcolumn === undefined
      ? {}
      : { endColumn: Number(element.attrs.endcolumn) }),
  };
}

function linesOf(projectRoot, side) {
  const absolute = projectFile(projectRoot, side.file);
  return absolute !== undefined && existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
        .split(/\r?\n/)
        .slice(side.line - 1, side.endLine)
    : [];
}

function clonedText(lines, side) {
  const cut = [...lines];
  if (cut.length > 0 && side.endColumn !== undefined) {
    cut[cut.length - 1] = cut[cut.length - 1].slice(0, side.endColumn - 1);
  }
  if (cut.length > 0 && side.column !== undefined) {
    cut[0] = cut[0].slice(side.column - 1);
  }
  return cut.join('\n');
}

export function tokenShape(text) {
  return text
    .replace(LITERAL_OR_COMMENT, ' ')
    .replace(NUMBER, ' ')
    .replace(WORD, ' ')
    .replace(/\s+/g, '');
}

function byFile(left, right) {
  return left.file.localeCompare(right.file);
}

function cloneOf(duplication, projectRoot, sides) {
  const [first, second] = sides;
  const lines = linesOf(projectRoot, first);
  return {
    first,
    second,
    fragment: lines.join('\n'),
    shape: tokenShape(clonedText(lines, first)),
    lines: Number(duplication.attrs.lines),
    tokens: Number(duplication.attrs.tokens),
  };
}

export function cpdClones(xml, projectRoot) {
  const report = parseXml(xml);
  return childrenNamed(report, 'duplication').flatMap((duplication) => {
    const [first, ...others] = childrenNamed(duplication, 'file')
      .map((element) => fileRange(element, projectRoot))
      .sort(byFile);
    return others.map((other) => cloneOf(duplication, projectRoot, [first, other]));
  });
}

function byPairAndShape(left, right) {
  return (
    byFile(left.first, right.first) ||
    byFile(left.second, right.second) ||
    left.shape.localeCompare(right.shape)
  );
}

function overlaps(left, right) {
  return left.file === right.file && left.line <= right.endLine && right.line <= left.endLine;
}

function sameClone(clone, other) {
  return (
    (overlaps(clone.first, other.first) && overlaps(clone.second, other.second)) ||
    (overlaps(clone.first, other.second) && overlaps(clone.second, other.first))
  );
}

function isBoilerplate(clone) {
  return clone.fragment !== '' && (isAccessorOnly(clone.fragment) || isDataTable(clone.fragment));
}

function distinctClones(clones) {
  const kept = [];
  for (const clone of clones) {
    if (!overlaps(clone.first, clone.second) && !kept.some((other) => sameClone(clone, other))) {
      kept.push(clone);
    }
  }
  return kept;
}

function jscpdRange(side, lines) {
  return { file: side.file, line: side.line, endLine: side.line + (lines ?? 1) - 1 };
}

function cloneList(xml, projectRoot) {
  return distinctClones(cpdClones(xml, projectRoot)).filter((clone) => !isBoilerplate(clone));
}

function readCpdClones(reportRoot, projectRoot) {
  const read = readCpdReport(reportRoot);
  return read.kind === 'report' ? cpdClones(read.xml, projectRoot) : [];
}

export function coveredByCpd(modules, projectRoot) {
  const cpdCloneList = modules.flatMap(({ reportRoot }) => readCpdClones(reportRoot, projectRoot));
  return (clone) => {
    const range = {
      first: jscpdRange(clone.first, clone.lines),
      second: jscpdRange(clone.second, clone.lines),
    };
    return cpdCloneList.some((other) => sameClone(range, other));
  };
}

function withTestAdvice(finding, testFiles) {
  const clone = /^This code repeats (\S+?)(?::\d+)?(?: \(\d+ lines\))?\./.exec(finding.message);
  const inTests = testFiles(finding.path) && clone !== null && testFiles(clone[1]);
  return inTests
    ? { ...finding, message: finding.message.replace(/ Keep one copy.*$/, ` ${TEST_ADVICE}`) }
    : finding;
}

export function readCpdFindings(reportRoot, { projectRoot, sourceRoots = [], testRoots, module }) {
  const read = readCpdReport(reportRoot);
  if (read.kind === 'missing') {
    return [];
  }
  if (read.kind === 'failed') {
    return [cpdNotRun(read.reason, [...sourceRoots, ...testRoots], module)];
  }
  const clones = cloneList(read.xml, projectRoot);
  function inTests(file) {
    return testRoots.some((root) => file.startsWith(`${root}/`));
  }
  const shaped = clones
    .map((clone) => ({ ...clone, fragment: clone.shape }))
    .sort((left, right) => byPairAndShape(left, right));
  const findings = evaluateDuplicates(shaped, DUPLICATES_TOOL)
    .filter((finding) => finding.classification === 'enforceable')
    .map((finding) => withTestAdvice(finding, inTests))
    .map((finding) => ({
      ...finding,
      identity: `${CPD_IDENTITY_PREFIX}${finding.identity}`,
    }));
  return [...skippedPaths(reportRoot, { projectRoot, xml: read.xml }), ...findings];
}
