import { analyseSource } from './java-scopes.mjs';

const TRANSPARENT = new Set([
  'getBytes',
  'toCharArray',
  'toString',
  'trim',
  'strip',
  'toUpperCase',
  'toLowerCase',
  'decode',
  'decodeBase64',
  'decodeHex',
  'parseHexBinary',
  'getDecoder',
  'getMimeDecoder',
  'getUrlDecoder',
  'valueOf',
  'copyOf',
  'copyOfRange',
  'forName',
  'concat',
  'repeat',
  'substring',
  'append',
  'format',
  'String',
  'StringBuilder',
]);
const WORDS = new Set(['new', 'null', 'true', 'false', 'byte', 'char', 'int', 'long', 'short']);
const LITERAL = /"(?:[^"\\\r\n]|\\.)*"|'(?:[^'\\\r\n]|\\.)*'/gu;
const NUMBER = /\b(?:0[xXbB][\dA-Fa-f_]+|\d[\w.]*)[lLfFdD]?/gu;
const TOKEN = /(\.\s*)?([A-Za-z_$][\w$]*)(\s*[.(])?/gu;
const CONSTANT = /^[A-Z][A-Z0-9_]*$/u;
const MAX_STEPS = 60;

function tokens(expression) {
  const bare = expression
    .replaceAll(LITERAL, '""')
    .replaceAll(NUMBER, '0')
    .replaceAll(/\bthis\s*\./gu, '');
  return [...bare.matchAll(TOKEN)].map(([, dotted, name, after = '']) => ({
    name,
    dotted: dotted !== undefined,
    call: after.trim() === '(',
    qualifier: after.trim() === '.',
  }));
}

function isLiteralPart({ name, dotted, call, qualifier }) {
  if (call) {
    return TRANSPARENT.has(name);
  }
  return WORDS.has(name) || (qualifier && /^[A-Z]/u.test(name)) || (dotted && CONSTANT.test(name));
}

function expressionStep(expression, scopes, seen) {
  const visited = new Set();
  const pending = [];
  for (const token of tokens(expression)) {
    if (isLiteralPart(token) || seen.has(token.name) || visited.has(token.name)) {
      continue;
    }
    const known = token.call || token.dotted ? undefined : scopes.initializers(token.name);
    if (known === undefined || (known.length === 0 && !CONSTANT.test(token.name))) {
      return undefined;
    }
    visited.add(token.name);
    pending.push(...known);
  }
  return { visited, pending };
}

export function isRuntime(expression, { source, offset }) {
  const scopes = analyseSource(source, offset);
  const seen = new Set();
  const queue = [expression];
  for (const [step, current] of queue.entries()) {
    const next = step > MAX_STEPS ? undefined : expressionStep(current, scopes, seen);
    if (next === undefined) {
      return true;
    }
    for (const name of next.visited) {
      seen.add(name);
    }
    queue.push(...next.pending);
  }
  return false;
}
