import { createRequire } from 'node:module';
import { lazy } from '../../../shared/rules/finding-helpers.mjs';
import { patternRuleHints } from '../../../shared/rules/regex/pattern-rules.mjs';

const BACKTRACKING_RULE = 'regexp/no-super-linear-backtracking';
const LINE_ASSERTION_RULES = new Set([
  'regexp/no-contradiction-with-assertion',
  'regexp/no-useless-assertions',
  'regexp/prefer-predefined-assertion',
]);
const BACKREFERENCE_RULES = new Set([
  'regexp/no-potentially-useless-backreference',
  'regexp/no-useless-backreference',
]);
const SHARED_FLAGS = /^[ims]*$/u;
const INLINE_FLAGS = /^\(\?([a-zA-Z]+)\)/u;
const NON_ASCII = /[^\0-\x7F]/u;
const LOOKBEHIND = /\(\?<[!=]/u;
const QUANTIFIED_GROUP = /\)[*+?{]/u;
const TOKENS = /\\[\s\S]?|[\s\S]/gu;
const DIALECT_ESCAPES = new Set(['p', 'P', 'v', '0']);
const UNICODE_CLASS_ESCAPE = /^[BDSWbdsw]$/u;
const BRACED_ESCAPE = /^[ux]\{/u;
const KEPT_ESCAPE = /^[\d$()*+./?A-Z[\\\]^a-z{|}]$/u;
const HEX_ESCAPE = /^(?:x([\dA-Fa-f]{2})|u([\dA-Fa-f]{4}))/u;
const CLASS_STATE = new Map([
  ['[', true],
  [']', false],
]);
const ASCII_LIMIT = 0x80;
const HEX_RADIX = 16;
const VALIDITY_RULE = 'no-invalid-regexp';

export const REGEX_DIALECTS = {
  java: { dot: '[^\\n\\r\\u0085\\u2028\\u2029]', unicodeClasses: false },
  python: { dot: '[^\\n]', unicodeClasses: true },
  pythonAscii: { dot: '[^\\n]', unicodeClasses: false },
};

const hints = new Map(patternRuleHints());
const load = createRequire(import.meta.url);
const engine = lazy(() => ({
  linter: new (load('eslint').Linter)(),
  config: [
    {
      plugins: { regexp: load('eslint-plugin-regexp') },
      rules: Object.fromEntries([
        [VALIDITY_RULE, 'error'],
        ...[...hints.keys()].map((rule) => [rule, 'error']),
      ]),
    },
  ],
}));

function withInlineFlags(pattern, flags) {
  const inline = INLINE_FLAGS.exec(pattern);
  if (inline === null) {
    return { pattern, flags };
  }
  return SHARED_FLAGS.test(inline[1])
    ? { pattern: pattern.slice(inline[0].length), flags: [...new Set(flags + inline[1])].join('') }
    : { skipped: `inline flags (?${inline[1]})` };
}

function escapeSkip(rest, dialect) {
  const next = rest[0] ?? '';
  if (DIALECT_ESCAPES.has(next) || (dialect.unicodeClasses && UNICODE_CLASS_ESCAPE.test(next))) {
    return `\\${next}`;
  }
  if (BRACED_ESCAPE.test(rest)) {
    return 'a braced escape';
  }
  const hex = HEX_ESCAPE.exec(rest);
  const code = hex === null ? 0 : Number.parseInt(hex[1] ?? hex[2], HEX_RADIX);
  return code >= ASCII_LIMIT ? 'an escape above ASCII' : undefined;
}

function escapeText(rest, { inClass, dialect }) {
  const skip = escapeSkip(rest, dialect);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const next = rest[0] ?? '';
  const keep = KEPT_ESCAPE.test(next) || (inClass && next === '-');
  return { text: keep ? `\\${next}` : next };
}

function characterText(token, { inClass, multiline, dotAll, last, dialect }) {
  if (inClass) {
    return { text: token };
  }
  if (token === '$' && !multiline && !last) {
    return { skipped: 'a `$` before the end of the pattern' };
  }
  return { text: token === '.' && !dotAll ? dialect.dot : token };
}

function translated(pattern, context) {
  let text = '';
  let inClass = false;
  let lineAnchor = context.multiline;
  for (const { 0: token, index } of pattern.matchAll(TOKENS)) {
    const state = { ...context, inClass, last: index + token.length === pattern.length };
    const piece = token.startsWith('\\')
      ? escapeText(pattern.slice(index + 1), state)
      : characterText(token, state);
    if (piece.skipped !== undefined) {
      return piece;
    }
    lineAnchor ||= token === '$' && !inClass;
    inClass = CLASS_STATE.get(token) ?? inClass;
    text += piece.text;
  }
  return { pattern: text, lineAnchor };
}

function dialectSkip(pattern) {
  if (pattern === '') {
    return 'an empty pattern';
  }
  if (NON_ASCII.test(pattern)) {
    return 'a character above ASCII';
  }
  if (LOOKBEHIND.test(pattern)) {
    return 'a lookbehind';
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

function dialectDependent({ ruleId }, { lineAnchor, loopedGroup }) {
  return (
    (lineAnchor && LINE_ASSERTION_RULES.has(ruleId)) ||
    (loopedGroup && BACKREFERENCE_RULES.has(ruleId))
  );
}

function lint({ pattern, lineAnchor }, flags) {
  const source = `new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(`u${flags}`)});`;
  const { linter, config } = engine();
  const messages = linter.verify(source, config);
  if (messages.some(({ ruleId }) => !hints.has(ruleId))) {
    return { skipped: 'syntax outside the shared subset' };
  }
  const loopedGroup = QUANTIFIED_GROUP.test(pattern);
  return {
    defects: messages
      .filter((message) => !dialectDependent(message, { lineAnchor, loopedGroup }))
      .map(defect),
  };
}

export function patternDefects(source, { flags = '', dialect } = {}) {
  if (!SHARED_FLAGS.test(flags)) {
    return { skipped: `flags ${flags}` };
  }
  const flagged = withInlineFlags(source, flags);
  const skip = flagged.skipped ?? dialectSkip(flagged.pattern);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const shared = translated(flagged.pattern, {
    dialect,
    multiline: flagged.flags.includes('m'),
    dotAll: flagged.flags.includes('s'),
  });
  return shared.skipped === undefined ? lint(shared, flagged.flags) : shared;
}
