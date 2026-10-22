import { closingIndex, enclosingOpen } from './kotlin-source.mjs';

const LOOP_HEADER = /\b(?:for|while)\s*\(/g;
const LOOP_VARIABLES = /^\s*(?:\(([^)]*)\)|([A-Za-z_]\w*))/;
const DO_LOOP = /\bdo\s*\{/g;
const ITERATING_FUNCTIONS = [
  'forEach',
  'forEachIndexed',
  'map',
  'mapNotNull',
  'mapIndexed',
  'flatMap',
  'filter',
  'filterNot',
  'onEach',
  'associate',
  'associateBy',
  'associateWith',
  'sumOf',
  'any',
  'all',
  'none',
  'count',
  'groupBy',
  'partition',
];
const ITERATING_LAMBDA = new RegExp(
  String.raw`\.\s*(?:${ITERATING_FUNCTIONS.join('|')})\s*(?:\([^()]*\)\s*)?\{`,
  'g',
);
const LOOP_LOOKBACK = 200;
const RETRY_LOOP_HEADER = /(?:\b(?:for|while)\s*\([^{}]*\)|\bdo|\brepeat\s*\([^()]*\))\s*$/;
const NAME = /(?<![\w.])[A-Za-z_]\w*/g;
const STATEMENT_END = /[;\n]/;
const ASSIGNMENT = /^(?:(?:val|var)\s+)?([A-Za-z_]\w*)\s*(?::[^=+\-*/]*)?[-+*/]?=(?!=)(.*)$/s;
const DECLARED = /^(?:val|var)\s+([A-Za-z_]\w*)/;
const ELVIS_EXIT = /\?:\s*(?:break|return)\b/;
const EXIT = /^(?:break|return)\b/;
const TRY_BLOCK = /\btry\s*\{/g;

function loopVariables(code, match) {
  if (match[0].startsWith('while')) {
    return [];
  }
  const open = match.index + match[0].length - 1;
  const names = LOOP_VARIABLES.exec(code.slice(open + 1, closingIndex(code, open)));
  return (names?.[1] ?? names?.[2] ?? '').split(',').map((name) => name.trim());
}

export function loopBodies(code) {
  const loops = [...code.matchAll(LOOP_HEADER)].flatMap((match) => {
    const headerOpen = match.index + match[0].length - 1;
    const headerClose = closingIndex(code, headerOpen);
    const brace = /^\s*\{/.exec(code.slice(headerClose + 1));
    if (brace === null) {
      return [];
    }
    const open = headerClose + brace[0].length;
    const condition = match[0].startsWith('while')
      ? code.slice(headerOpen + 1, headerClose)
      : undefined;
    const variables = loopVariables(code, match);
    return [{ open, close: closingIndex(code, open), variables, condition }];
  });
  const doLoops = [...code.matchAll(DO_LOOP)].map((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(code, open);
    const tail = /^\s*while\s*\(/.exec(code.slice(close + 1));
    const conditionOpen = tail === null ? -1 : close + tail[0].length;
    const condition =
      tail === null ? undefined : code.slice(conditionOpen + 1, closingIndex(code, conditionOpen));
    return { open, close, variables: [], condition };
  });
  const lambdas = [...code.matchAll(ITERATING_LAMBDA)].map((match) => {
    const open = match.index + match[0].length - 1;
    const parameters = /^\{([\w\s,()]*)->/.exec(code.slice(open));
    const variables =
      parameters === null ? ['it'] : parameters[1].split(/[\s,()]+/).filter((name) => name !== '');
    return { open, close: closingIndex(code, open), variables, condition: undefined };
  });
  return [...loops, ...doLoops, ...lambdas];
}

export function isRetry(code, tryBlock) {
  const body = code.slice(tryBlock.open, tryBlock.close);
  if (!/\b(?:return|break)\b/.test(body)) {
    return false;
  }
  const outer = enclosingOpen(code, tryBlock.open);
  return (
    outer !== -1 && RETRY_LOOP_HEADER.test(code.slice(Math.max(0, outer - LOOP_LOOKBACK), outer))
  );
}

function namesIn(text) {
  return new Set(text.match(NAME) ?? []);
}

function statementsOf(text) {
  return text
    .split(STATEMENT_END)
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');
}

function exitsAtEnd(branch) {
  return EXIT.test(statementsOf(branch).at(-1) ?? '');
}

function exitTests(body) {
  const tests = [...body.matchAll(/\bif\s*\(/g)].flatMap((match) => {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(body, open);
    const block = /^\s*\{/.exec(body.slice(close + 1));
    const exits =
      block === null
        ? EXIT.test(body.slice(close + 1).trimStart())
        : exitsAtEnd(
            body.slice(close + block[0].length + 1, closingIndex(body, close + block[0].length)),
          );
    return exits ? [body.slice(open + 1, close)] : [];
  });
  const elvis = statementsOf(body).flatMap((statement) => {
    const declared = DECLARED.exec(statement);
    return declared !== null && ELVIS_EXIT.test(statement) ? [declared[1]] : [];
  });
  return [...tests, ...elvis];
}

function assignments(body) {
  return statementsOf(body).flatMap((statement) => {
    const assigned = ASSIGNMENT.exec(statement);
    return assigned === null ? [] : [{ name: assigned[1], value: assigned[2] }];
  });
}

function assignedFrom(pairs, readsIo, found) {
  const next = new Set(found);
  for (const { name, value } of pairs) {
    if (readsIo(value) || [...namesIn(value)].some((read) => next.has(read))) {
      next.add(name);
    }
  }
  return next;
}

function ioNames(body, readsIo) {
  const pairs = assignments(body);
  return assignedFrom(pairs, readsIo, assignedFrom(pairs, readsIo, new Set()));
}

export function isPagingLoop(code, loop, readsIo) {
  if (loop.condition === undefined) {
    return false;
  }
  const body = code.slice(loop.open + 1, loop.close);
  const read = ioNames(body, readsIo);
  return [loop.condition, ...exitTests(body)].some((test) =>
    [...namesIn(test)].some((name) => read.has(name)),
  );
}

export function retryAttempts(code) {
  const tries = [...code.matchAll(TRY_BLOCK)].map((match) => {
    const open = match.index + match[0].length - 1;
    return { open, close: closingIndex(code, open) };
  });
  return (loop, offset) => {
    const attempt = tries.filter(({ open, close }) => open < offset && offset < close).at(-1);
    return (
      attempt !== undefined &&
      enclosingOpen(code, attempt.open) === loop.open &&
      isRetry(code, attempt)
    );
  };
}
