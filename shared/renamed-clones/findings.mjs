import { evaluateDuplicates, RENAMED_IDENTITY_PREFIX } from '../rules/duplicates.mjs';
import { isBoilerplate } from './boilerplate.mjs';
import { readProjectFile } from './files.mjs';
import { isRepeatingShape } from './repetition.mjs';

const WHITESPACE = /\s+/gu;
const CLONE_MESSAGE = /^This code repeats (\S+?)(?::\d+)? \(\d+ lines\)\./u;
const KEEP_ONE_COPY = / Keep one copy and call it from both places\./u;

function span(side, lines) {
  return { file: side.file, from: side.line, to: side.line + (lines ?? 1) - 1 };
}

function touches(left, right) {
  return left.file === right.file && left.from <= right.to && right.from <= left.to;
}

function spans(clone) {
  return [span(clone.first, clone.lines), span(clone.second, clone.lines)];
}

function sameClone(clone, other) {
  const [first, second] = spans(clone);
  const [otherFirst, otherSecond] = spans(other);
  return (
    (touches(first, otherFirst) && touches(second, otherSecond)) ||
    (touches(first, otherSecond) && touches(second, otherFirst))
  );
}

function byFilesAndShape(left, right) {
  return (
    left.first.file.localeCompare(right.first.file) ||
    left.second.file.localeCompare(right.second.file) ||
    left.fragment.localeCompare(right.fragment) ||
    left.first.line - right.first.line
  );
}

function ordered(clone) {
  const [first, second] = [clone.first, clone.second].sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line,
  );
  return { ...clone, first, second };
}

function originalLines(projectRoot, side, lines) {
  const text = readProjectFile(projectRoot, side.file);
  return text === undefined ? [] : text.split(/\r?\n/u).slice(side.line - 1, side.line - 1 + lines);
}

export function renamedClones(clones, { projectRoot, syntax }) {
  return clones
    .map((clone) => ordered({ ...clone, fragment: (clone.fragment ?? '').replace(WHITESPACE, '') }))
    .filter((clone) => !touches(...spans(clone)))
    .filter((clone) => !isRepeatingShape(clone.fragment))
    .map((clone) => ({ ...clone, lines: clone.lines ?? 1 }))
    .map((clone) => ({ ...clone, original: originalLines(projectRoot, clone.first, clone.lines) }))
    .filter((clone) => !isBoilerplate(clone.original, syntax))
    .map(({ original, ...clone }) => ({ ...clone, original: original.join('\n') }))
    .sort(byFilesAndShape);
}

export function withoutRenamedCopies(plainClones, renamed) {
  return plainClones.filter((clone) => !renamed.some((other) => sameClone(clone, other)));
}

function withTestAdvice(finding, { isTestFile, text }) {
  const other = CLONE_MESSAGE.exec(finding.message)?.[1];
  return other !== undefined && isTestFile(finding.path) && isTestFile(other)
    ? { ...finding, message: finding.message.replace(KEEP_ONE_COPY, ` ${text}`) }
    : finding;
}

export function renamedFindings(clones, analyzerName, testAdvice) {
  return evaluateDuplicates(clones, analyzerName)
    .map((finding) => (testAdvice === undefined ? finding : withTestAdvice(finding, testAdvice)))
    .map((finding) => ({ ...finding, identity: `${RENAMED_IDENTITY_PREFIX}${finding.identity}` }));
}
