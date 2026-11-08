import { execAt, trimmedEnd } from '../../discovery/text-scan.mjs';

const WINDOW = 120;
const TIME_NOW = String.raw`(?:Instant|Local\w+|Zoned\w+|Offset\w+|Year\w*|MonthDay)\s*\.\s*now\s*\([^()]*\)`;
const CLOCK_FORMS = [
  TIME_NOW,
  String.raw`System\s*\.\s*currentTimeMillis\s*\(\s*\)`,
  String.raw`Clock\s*\.\s*System\s*\.\s*now\s*\(\s*\)`,
].join('|');
const CLOCK_HEAD = new RegExp(String.raw`^(?:[a-z]\w*\s*\.\s*)*(?:${CLOCK_FORMS})`, 'u');
const CLOCK_TAIL = new RegExp(String.raw`(?:${CLOCK_FORMS})(?:\s*\.\s*\w+\s*\([^()]*\))*$`, 'u');
const COMPARISON_BEFORE = /[\w)\]"}]\s*[<>]=?$/u;
const COMPARISON_AFTER = /\s*(?:<=|>=|<(?!<)|>(?!>))/uy;
const MINUS_BEFORE = /[\w)\]"}]\s*-$/u;
const MINUS_AFTER = /\s*-(?![->=])\s*/uy;
const NUMBER_TAIL = /(?<![\w.])\d[\w.]*$/u;
const METHOD_TAIL = /(?<![\w.)])[a-z_]\w*(?:\s*\.\s*\w+)+\s*\(\s*\)$/u;
const NAME_TAIL = /(?<![\w.])([A-Za-z_]\w*)(?:\s*\.\s*\w+)*$/u;
const NAME_HEAD = /^([A-Za-z_]\w*)(\s*\()?/u;
const UPPER = /^[A-Z]/u;

function measuresRight(code, at) {
  const text = code.slice(at, at + WINDOW);
  const head = NAME_HEAD.exec(text);
  if (CLOCK_HEAD.test(text)) {
    return true;
  }
  return head !== null && !UPPER.test(head[1]) && head[2] === undefined;
}

function measuresLeft(code, stop) {
  const text = code.slice(Math.max(0, stop - WINDOW), stop);
  if (NUMBER_TAIL.test(text)) {
    return false;
  }
  if (text.endsWith(')')) {
    return CLOCK_TAIL.test(text) || METHOD_TAIL.test(text);
  }
  const root = NAME_TAIL.exec(text)?.[1];
  return root !== undefined && !UPPER.test(root);
}

function subtraction(scanned, start, end) {
  const { code } = scanned;
  const stop = trimmedEnd(scanned, start);
  const head = code.slice(Math.max(0, stop - WINDOW), stop);
  const after = execAt(code, MINUS_AFTER, end);
  const rightOk = after !== null && measuresRight(code, end + after[0].length);
  const leftOk = MINUS_BEFORE.test(head) && measuresLeft(code, trimmedEnd(scanned, stop - 1));
  return rightOk || leftOk;
}

export function isOperand(scanned, start, end) {
  const stop = trimmedEnd(scanned, start);
  const head = scanned.code.slice(Math.max(0, stop - WINDOW), stop);
  return (
    COMPARISON_BEFORE.test(head) ||
    execAt(scanned.code, COMPARISON_AFTER, end) !== null ||
    subtraction(scanned, start, end)
  );
}
