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
