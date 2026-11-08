import { Linter } from 'eslint';
import regexp from 'eslint-plugin-regexp';
import { patternRuleHints } from '../../../shared/rules/regex/pattern-rules.mjs';

const BACKTRACKING_RULE = 'regexp/no-super-linear-backtracking';
const VALIDITY_RULE = 'no-invalid-regexp';
const SHARED_FLAGS = /^[ims]*$/u;
const INLINE_FLAGS = /^\(\?([a-zA-Z]+)\)/u;
const NON_ASCII = /[^\0-\x7F]/u;
const TOKENS = /\\[\s\S]?|[\s\S]/gu;
const DIALECT_ESCAPES = new Set(['p', 'P', 'v', '0']);
const KEPT_ESCAPE = /^[\d$()*+./?A-Z[\\\]^a-z{|}]$/u;
const HEX_ESCAPE = /^(?:x([\dA-Fa-f]{2})|u([\dA-Fa-f]{4}))/u;
const CLASS_STATE = new Map([
  ['[', true],
  [']', false],
]);
const ASCII_LIMIT = 0x80;
const HEX_RADIX = 16;

const hints = new Map(patternRuleHints());
const linter = new Linter();
const lintConfig = [
  {
    plugins: { regexp },
    rules: Object.fromEntries([
      [VALIDITY_RULE, 'error'],
      ...[...hints.keys()].map((rule) => [rule, 'error']),
    ]),
  },
];

function withInlineFlags(pattern, flags) {
  const inline = INLINE_FLAGS.exec(pattern);
  if (inline === null) {
    return { pattern, flags };
  }
  return SHARED_FLAGS.test(inline[1])
    ? { pattern: pattern.slice(inline[0].length), flags: [...new Set(flags + inline[1])].join('') }
    : { skipped: `inline flags (?${inline[1]})` };
}

function escapeSkip(rest) {
  if (DIALECT_ESCAPES.has(rest[0])) {
    return `\\${rest[0]}`;
  }
  const hex = HEX_ESCAPE.exec(rest);
  const code = hex === null ? 0 : Number.parseInt(hex[1] ?? hex[2], HEX_RADIX);
  return code >= ASCII_LIMIT ? 'an escape above ASCII' : undefined;
}

function escapeText(rest, inClass) {
  const skip = escapeSkip(rest);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const next = rest[0] ?? '';
  const keep = KEPT_ESCAPE.test(next) || (inClass && next === '-');
  return { text: keep ? `\\${next}` : next };
}

function characterText(token, { inClass, multiline, last }) {
  return token === '$' && !inClass && !multiline && !last
    ? { skipped: 'a `$` before the end of the pattern' }
    : { text: token };
}

function translated(pattern, multiline) {
  let text = '';
  let inClass = false;
  for (const { 0: token, index } of pattern.matchAll(TOKENS)) {
    const last = index + token.length === pattern.length;
    const piece = token.startsWith('\\')
      ? escapeText(pattern.slice(index + 1), inClass)
      : characterText(token, { inClass, multiline, last });
    if (piece.skipped !== undefined) {
      return piece;
    }
    inClass = CLASS_STATE.get(token) ?? inClass;
    text += piece.text;
  }
  return { pattern: text };
}

function dialectSkip(pattern) {
  if (pattern === '') {
    return 'an empty pattern';
  }
  if (NON_ASCII.test(pattern)) {
    return 'a character above ASCII';
  }
  return pattern.includes('&&') ? 'class intersection `&&`' : undefined;
}

function defect(message) {
  const hint = hints.get(message.ruleId);
  return {
    rule: message.ruleId,
    kind: message.ruleId === BACKTRACKING_RULE ? 'backtracking' : 'part',
    description: message.message,
    hint: hint.trimStart(),
    message: `${message.message}${hint}`,
  };
}

function lint(pattern, flags) {
  const source = `new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(`u${flags}`)});`;
  const messages = linter.verify(source, lintConfig);
  return messages.some(({ ruleId }) => !hints.has(ruleId))
    ? { skipped: 'syntax outside the shared subset' }
    : { defects: messages.map(defect) };
}

export function patternDefects(source, { flags = '' } = {}) {
  if (!SHARED_FLAGS.test(flags)) {
    return { skipped: `flags ${flags}` };
  }
  const flagged = withInlineFlags(source, flags);
  const skip = flagged.skipped ?? dialectSkip(flagged.pattern);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const shared = translated(flagged.pattern, flagged.flags.includes('m'));
  return shared.skipped === undefined ? lint(shared.pattern, flagged.flags) : shared;
}
