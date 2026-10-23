import { closeOf, execAt, marksFrom, repeatUntil, skipSpace } from '../../discovery/text-scan.mjs';

const CONTINUATION = /\s*(?:\.|\?[.:]|&&|\|\|)/u;
const ELSE = /\s*else\b\s*/u;
const IF_HEAD = /if\s*\(/u;
const STATEMENT_MARKS = /[({[)}\];\n]|(?<![\w.`])else\b/gu;
const ARROW_MARKS = /->|[()[\]{},\n]/gu;
const TYPE_LIKE = /^(?:!?is\s+\S.*|null|[A-Z]\w*(?:\s*\.\s*\w+)*)$/u;
const MAX_ELSE_CHAIN = 50;
const MAX_WHEN_BRANCHES = 500;

export function statementEnd(code, from) {
  const state = { depth: 0 };
  for (const { index, 0: char } of marksFrom(code, STATEMENT_MARKS, from)) {
    state.depth += '({['.includes(char) ? 1 : 0;
    state.depth -= ')}]'.includes(char) ? 1 : 0;
    if (state.depth < 0 || (state.depth === 0 && (char === ';' || char === 'else'))) {
      return index;
    }
    if (char === '\n' && state.depth <= 0 && execAt(code, CONTINUATION, index + 1) === null) {
      return index;
    }
  }
  return code.length;
}

export function bodyRange(text, from) {
  const { code } = text;
  const start = skipSpace(code, from);
  if (code[start] === '{') {
    const close = closeOf(text, start);
    return { start: start + 1, end: close, next: close + 1 };
  }
  const end = statementEnd(code, start);
  return { start, end, next: end };
}

export function ifBranches(text, ifIndex) {
  const { code } = text;
  const first = closeOf(text, code.indexOf('(', ifIndex)) + 1;
  const state = { branches: [bodyRange(text, first)], hasElse: false };
  repeatUntil(MAX_ELSE_CHAIN, () => {
    const tail = execAt(code, ELSE, state.branches.at(-1).next);
    if (tail === null) {
      return true;
    }
    const from = state.branches.at(-1).next + tail[0].length;
    const isIf = execAt(code, IF_HEAD, from) !== null;
    state.branches.push(bodyRange(text, isIf ? closeOf(text, code.indexOf('(', from)) + 1 : from));
    state.hasElse = !isIf;
    return !isIf;
  });
  return { branches: state.branches, hasElse: state.hasElse, end: state.branches.at(-1).next };
}

function nextArrow(code, from, limit) {
  const state = { depth: 0 };
  for (const { index, 0: mark } of marksFrom(code, ARROW_MARKS, from)) {
    if (index >= limit) {
      return -1;
    }
    state.depth += '([{'.includes(mark) ? 1 : 0;
    state.depth -= ')]}'.includes(mark) ? 1 : 0;
    if (mark === '->' && state.depth === 0) {
      return index;
    }
  }
  return -1;
}

function conditionsExhaust(conditions) {
  return conditions.every(
    (text) => text === 'else' || text.split(',').every((item) => TYPE_LIKE.test(item.trim())),
  );
}

export function whenBranches(text, whenIndex, afterKeyword) {
  const { code } = text;
  const subject = code[skipSpace(code, afterKeyword)] === '(';
  const subjectEnd = subject ? closeOf(text, skipSpace(code, afterKeyword)) + 1 : afterKeyword;
  const open = skipSpace(code, subjectEnd);
  if (code[open] !== '{') {
    return undefined;
  }
  const close = closeOf(text, open);
  const state = { at: open + 1, branches: [], conditions: [] };
  repeatUntil(MAX_WHEN_BRANCHES, () => {
    const arrow = nextArrow(code, state.at, close);
    if (arrow < 0) {
      return true;
    }
    const body = bodyRange(text, arrow + 2);
    state.conditions.push(code.slice(state.at, arrow).trim());
    state.branches.push(body);
    state.at = Math.max(body.next, arrow + 2);
    return false;
  });
  const exhaustive =
    state.conditions.includes('else') || (subject && conditionsExhaust(state.conditions));
  return { branches: state.branches, exhaustive, end: close + 1, from: whenIndex };
}
