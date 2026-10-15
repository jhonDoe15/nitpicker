import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdClones } from '../../../core/tooling/jscpd-clones.mjs';
import { evaluateDuplicates } from '../../../shared/rules/duplicates.mjs';
import { childrenNamed, parseXml } from '../ingest/common.mjs';

const CPD_REPORT = 'cpd.xml';
const JSCPD_REPORT = 'duplicates.json';
const DUPLICATES_TOOL = 'duplicates';
const TEST_ADVICE =
  'Extract a helper, or fold the cases into one @ParameterizedTest. Keep one copy and call it from both places.';
const NOT_CONTROL = String.raw`(?!(?:else|if|for|while|switch|catch|try|do|synchronized|new|return|throw)\b)`;
const MODIFIERS = String.raw`(?:(?:public|protected|private|static|final|abstract|synchronized)\s+)*`;
const BOILERPLATE_LINES = [
  /^[{}]*$/,
  /^@\w+(?:\(.*\))?$/,
  new RegExp(
    String.raw`^${NOT_CONTROL}${MODIFIERS}[\w<>\[\],.? ]+\s+\w+\s*\([^)]*\)\s*(?:throws [\w., ]+)?\s*\{$`,
  ),
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}[A-Z]\w*\s*\([^)]*\)\s*\{$`),
  new RegExp(String.raw`^${MODIFIERS}(?:class|interface|record|enum)\s+\w+.*\{$`),
  /^return\s+(?:this\.)?\w+;$/,
  /^(?:this\.)?\w+\s*=\s*\w+;$/,
  new RegExp(String.raw`^${NOT_CONTROL}${MODIFIERS}[\w<>\[\],.? ]+\s+\w+;$`),
];

const STRING_LITERAL = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
const DATA_LINES = [
  /^[A-Z][A-Z0-9_]*(?:\(.*\))?[,;]?$/,
  /^(?:Arguments\.)?(?:of|arguments)\(.*\)[,;)]*$/,
  /^[\w.]*[\s\d.,{}()[\]+-]*$/,
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
  };
}

function fragmentOf(projectRoot, side) {
  const absolute = path.join(projectRoot, side.file);
  return existsSync(absolute)
    ? readFileSync(absolute, 'utf8')
        .split(/\r?\n/)
        .slice(side.line - 1, side.endLine)
        .join('\n')
    : '';
}

function cloneOf(duplication, projectRoot, sides) {
  const [first, second] = sides;
  return {
    first,
    second,
    fragment: fragmentOf(projectRoot, first),
    lines: Number(duplication.attrs.lines),
    tokens: Number(duplication.attrs.tokens),
  };
}

export function cpdClones(xml, projectRoot) {
  const report = parseXml(xml);
  return childrenNamed(report, 'duplication').flatMap((duplication) => {
    const [first, ...others] = childrenNamed(duplication, 'file').map((element) =>
      fileRange(element, projectRoot),
    );
    return others.map((other) => cloneOf(duplication, projectRoot, [first, other]));
  });
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

function jscpdRanges(reportRoot) {
  const report = path.join(reportRoot, JSCPD_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const { runs } = JSON.parse(readFileSync(report, 'utf8'));
  return runs.flatMap(({ root, report: run }) =>
    jscpdClones(run, [root]).map((clone) => ({
      first: {
        file: clone.first.file,
        line: clone.first.line,
        endLine: clone.first.line + (clone.lines ?? 0),
      },
      second: {
        file: clone.second.file,
        line: clone.second.line,
        endLine: clone.second.line + (clone.lines ?? 0),
      },
    })),
  );
}

function withTestAdvice(finding, testFiles) {
  const clone = /^This code repeats (\S+?)(?::\d+)?(?: \(\d+ lines\))?\./.exec(finding.message);
  const inTests = testFiles(finding.path) && clone !== null && testFiles(clone[1]);
  return inTests
    ? { ...finding, message: finding.message.replace(/ Keep one copy.*$/, ` ${TEST_ADVICE}`) }
    : finding;
}

export function readCpdFindings(reportRoot, { projectRoot, testRoots }) {
  const report = path.join(reportRoot, CPD_REPORT);
  if (!existsSync(report)) {
    return [];
  }
  const known = jscpdRanges(reportRoot);
  const clones = distinctClones(cpdClones(readFileSync(report, 'utf8'), projectRoot)).filter(
    (clone) => !isBoilerplate(clone) && !known.some((other) => sameClone(clone, other)),
  );
  function inTests(file) {
    return testRoots.some((root) => file.startsWith(`${root}/`));
  }
  return evaluateDuplicates(clones, DUPLICATES_TOOL)
    .filter((finding) => finding.classification === 'enforceable')
    .map((finding) => withTestAdvice(finding, inTests));
}
