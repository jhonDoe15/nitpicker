import { closingIndex, enclosingOpen, lineAt, lineStart } from '../kotlin-source.mts';
import type { Ruled, Scanned } from '../typed/scan-shapes.mts';
import { chainFrom, escapeRegExp } from '../typed/typed-scan.mts';

type WaitScope = { start: number; end: number; text: string; inLambda: boolean };

const UNTIMED_WAIT =
  /\??\.\s*waitFor\s*\(\s*\)|\.\s*onExit\s*\(\s*\)\s*\.\s*(?:get|join)\s*\(\s*\)/g;
const TIMED_WAIT = /(?<![\w$])waitFor\s*\(\s*[^)\s]/g;
const OUTPUT = new RegExp(
  [
    String.raw`\.\s*(?:inputStream|errorStream`,
    String.raw`getInputStream\s*\(\s*\)|getErrorStream\s*\(\s*\)`,
    String.raw`inputReader\s*\([^()]*\)|errorReader\s*\([^()]*\))`,
  ].join('|'),
  'g',
);
const READ_CALLS =
  'readBytes|readAllBytes|readText|readLines|readLine|lines|transferTo|copyTo|useLines|forEachLine';
const USE_READ = String.raw`\.\s*use\s*\{[^}]*\b(?:readBytes|readAllBytes|readText|readLines)\s*\(`;
const WHOLE_READ = new RegExp(String.raw`\.\s*(?:${READ_CALLS})\s*[({]|${USE_READ}`);
const STARTS_PROCESS =
  /\.\s*start\s*\(\s*\)|\bRuntime\s*\.\s*getRuntime\s*\(\s*\)\s*\.\s*exec\s*\(/;
const RECEIVER = /([A-Za-z_]\w*)\s*$/;
const FUNCTION_HEADER = /(?<![\w$])fun(?![\w$])/;
const CONTROL_HEADER =
  /^\s*(?:\}\s*)?(?:if|else|while|for|try|catch|finally|when|do|init)\b|\b(?:class|object|interface)\b/;
const HELD_STREAM = /(?<![\w$])va[lr]\s+([A-Za-z_]\w*)\s*(?::[^=]*)?=/;

const PROCESS_MESSAGES = {
  ProcessWaitWithoutTimeout:
    'Wait with a deadline: `if (!process.waitFor(30, TimeUnit.SECONDS)) process.destroyForcibly()`, and read the output on another thread (or redirect it to a file) before that wait. This waits for the child process without a deadline, so a command that never exits hangs this request, job or command for good. An exception fits only a program whose purpose is to run the child to completion, such as a build wrapper.',
};

function headerStart(code: string, open: number): number {
  return (
    Math.max(
      code.lastIndexOf('{', open - 1),
      code.lastIndexOf('}', open - 1),
      code.lastIndexOf(';', open - 1),
    ) + 1
  );
}

function enclosingOpens(code: string, offset: number): number[] {
  const shifted = chainFrom(
    enclosingOpen(code, offset) + 1,
    (next) => enclosingOpen(code, next - 1) + 1,
  );
  return shifted.map((next) => next - 1);
}

function functionScope(code: string, offset: number): WaitScope {
  const opens = enclosingOpens(code, offset);
  const open = opens.find((candidate) =>
    FUNCTION_HEADER.test(code.slice(headerStart(code, candidate), candidate)),
  );
  const start = open === undefined ? 0 : headerStart(code, open);
  const end = open === undefined ? code.length : closingIndex(code, open) + 1;
  const inLambda = opens
    .slice(0, open === undefined ? undefined : opens.indexOf(open))
    .some((candidate) => !CONTROL_HEADER.test(code.slice(headerStart(code, candidate), candidate)));
  return { start, end, text: code.slice(start, end), inLambda };
}

function continuesChain(code: string, start: number): boolean {
  return /^\s*\??\./.test(lineAt(code, start));
}

function statementStart(code: string, offset: number): number {
  const starts = chainFrom(lineStart(code, offset) + 1, (shifted) =>
    shifted > 1 && continuesChain(code, shifted - 1) ? lineStart(code, shifted - 2) + 1 : undefined,
  );
  const start = (starts.at(-1) ?? 0) - 1;
  return Math.max(start, code.lastIndexOf(';', offset) + 1, code.lastIndexOf('{', offset) + 1);
}

function statementRest(code: string, offset: number): string {
  const starts = chainFrom(code.indexOf('\n', offset) + 1, (next) =>
    continuesChain(code, next) ? code.indexOf('\n', next) + 1 : undefined,
  );
  const last = starts.at(-1);
  const toEnd = last === undefined || continuesChain(code, last);
  return code.slice(offset, toEnd ? undefined : last - 1);
}

function declaresProcess(scope: string, name: string): boolean {
  const declaration = new RegExp(
    `(?<![\\w$])(?:va[lr]\\s+${escapeRegExp(name)}\\s*(?::\\s*Process\\??\\s*)?=([^;\\n]*(?:\\n\\s*\\??\\.[^;\\n]*)*)|${escapeRegExp(name)}\\s*:\\s*Process\\b)`,
  );
  const found = declaration.exec(scope);
  return found !== null && (found[1] === undefined || STARTS_PROCESS.test(found[1]));
}

function isProcessOutput(code: string, scope: string, offset: number): boolean {
  const receiver = code.slice(statementStart(code, offset), offset);
  if (STARTS_PROCESS.test(receiver)) {
    return true;
  }
  const name = RECEIVER.exec(receiver)?.[1];
  return name !== undefined && declaresProcess(scope, name);
}

function boundedRead(scope: WaitScope, offset: number): boolean {
  const timed = [...scope.text.matchAll(TIMED_WAIT)];
  return timed.length > 0 && (scope.inLambda || (timed[0]?.index ?? 0) + scope.start < offset);
}

function heldRead(code: string, scope: WaitScope, offset: number): boolean {
  const statement = code.slice(statementStart(code, offset), offset);
  const name = HELD_STREAM.exec(statement)?.[1];
  if (name === undefined) {
    return false;
  }
  const later = code.slice(offset, scope.end);
  return new RegExp(
    String.raw`(?<![\w$])${escapeRegExp(name)}\s*\??\.\s*(?:${READ_CALLS})\s*[({]`,
  ).test(later);
}

function wholeOutputReads(code: string): number[] {
  return [...code.matchAll(OUTPUT)].flatMap(({ index, 0: text }) => {
    const scope = functionScope(code, index);
    const reads =
      WHOLE_READ.test(statementRest(code, index + text.length)) || heldRead(code, scope, index);
    if (!reads || !isProcessOutput(code, scope.text, index)) {
      return [];
    }
    return boundedRead(scope, index) ? [] : [statementStart(code, index)];
  });
}

export function processWaitsWithoutTimeout(scanned: Scanned): Ruled[] {
  const { code } = scanned;
  const offsets = [
    ...[...code.matchAll(UNTIMED_WAIT)].map(({ index }) => index),
    ...wholeOutputReads(code),
  ];
  return [...new Set(offsets)]
    .toSorted((left, right) => left - right)
    .map((offset) => ({
      rule: 'ProcessWaitWithoutTimeout',
      offset: offset + code.slice(offset).search(/\S/),
    }));
}

export const kotlinSourceRules = { messages: PROCESS_MESSAGES, main: [processWaitsWithoutTimeout] };
