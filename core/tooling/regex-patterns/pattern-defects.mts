import { createRequire } from 'node:module';
import type { ESLint, Linter } from 'eslint';
import { lazy as untypedLazy } from '../../../shared/rules/finding-helpers.mjs';
import { patternRuleHints } from '../../../shared/rules/regex/pattern-rules.mjs';
import { fieldOf } from '../../../shared/values/readers.mts';

type Dialect = { readonly dot: string; readonly unicodeClasses: boolean };
type Piece = { skipped: string; text?: undefined } | { text: string; skipped?: undefined };
type Flagged =
  | { skipped: string; pattern?: undefined; flags?: undefined }
  | { pattern: string; flags: string; skipped?: undefined };
type Translated =
  | { skipped: string; pattern?: undefined; lineAnchor?: undefined }
  | { pattern: string; lineAnchor: boolean; skipped?: undefined };
type Defect = {
  rule: string;
  kind: string;
  description: string;
  hint: string;
  message: string;
};
type Message = Pick<Linter.LintMessage, 'ruleId' | 'message'>;
type Engine = { linter: Linter; config: Linter.Config[] };
type PatternContext = {
  readonly dialect: Dialect;
  readonly multiline: boolean;
  readonly dotAll: boolean;
};
type PieceState = PatternContext & { readonly inClass: boolean; readonly last: boolean };

const lazy: <Value>(read: () => Value) => () => Value = untypedLazy;
const ruleHints: () => [string, string][] = patternRuleHints;

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

export const REGEX_DIALECTS: Record<'java' | 'python' | 'pythonAscii', Dialect> = {
  java: { dot: '[^\\n\\r\\u0085\\u2028\\u2029]', unicodeClasses: false },
  python: { dot: '[^\\n]', unicodeClasses: true },
  pythonAscii: { dot: '[^\\n]', unicodeClasses: false },
};

const hints = new Map(ruleHints());
const load = createRequire(import.meta.url);

function isEslintModule(value: unknown): value is { Linter: new () => Linter } {
  return typeof fieldOf(value, 'Linter') === 'function';
}

function isPlugin(value: unknown): value is ESLint.Plugin {
  return typeof value === 'object' && value !== null;
}

function createEngine(): Engine {
  const eslint: unknown = load('eslint');
  const plugin: unknown = load('eslint-plugin-regexp');
  if (!(isEslintModule(eslint) && isPlugin(plugin))) {
    throw new TypeError('eslint or eslint-plugin-regexp did not load');
  }
  return {
    linter: new eslint.Linter(),
    config: [
      {
        plugins: { regexp: plugin },
        rules: Object.fromEntries([
          [VALIDITY_RULE, 'error'],
          ...[...hints.keys()].map((rule): [string, 'error'] => [rule, 'error']),
        ] satisfies [string, 'error'][]),
      },
    ],
  };
}

const engine = lazy(createEngine);

function withInlineFlags(pattern: string, flags: string): Flagged {
  const inline = INLINE_FLAGS.exec(pattern);
  if (inline === null) {
    return { pattern, flags };
  }
  const inlineFlags = inline[1] ?? '';
  return SHARED_FLAGS.test(inlineFlags)
    ? {
        pattern: pattern.slice(inline[0].length),
        flags: [...new Set(flags + inlineFlags)].join(''),
      }
    : { skipped: `inline flags (?${inlineFlags})` };
}

function escapeSkip(rest: string, dialect: Dialect): string | undefined {
  const next = rest[0] ?? '';
  if (DIALECT_ESCAPES.has(next) || (dialect.unicodeClasses && UNICODE_CLASS_ESCAPE.test(next))) {
    return `\\${next}`;
  }
  if (BRACED_ESCAPE.test(rest)) {
    return 'a braced escape';
  }
  const hex = HEX_ESCAPE.exec(rest);
  const code = hex === null ? 0 : Number.parseInt(hex[1] ?? hex[2] ?? '', HEX_RADIX);
  return code >= ASCII_LIMIT ? 'an escape above ASCII' : undefined;
}

function escapeText(rest: string, { inClass, dialect }: PieceState): Piece {
  const skip = escapeSkip(rest, dialect);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const next = rest[0] ?? '';
  const keep = KEPT_ESCAPE.test(next) || (inClass && next === '-');
  return { text: keep ? `\\${next}` : next };
}

function characterText(
  token: string,
  { inClass, multiline, dotAll, last, dialect }: PieceState,
): Piece {
  if (inClass) {
    return { text: token };
  }
  if (token === '$' && !multiline && !last) {
    return { skipped: 'a `$` before the end of the pattern' };
  }
  return { text: token === '.' && !dotAll ? dialect.dot : token };
}

function translated(pattern: string, context: PatternContext): Translated {
  let text = '';
  let inClass = false;
  let lineAnchor = context.multiline;
  for (const { 0: token, index } of pattern.matchAll(TOKENS)) {
    const state: PieceState = {
      ...context,
      inClass,
      last: index + token.length === pattern.length,
    };
    const piece = token.startsWith('\\')
      ? escapeText(pattern.slice(index + 1), state)
      : characterText(token, state);
    if (piece.skipped !== undefined) {
      return { skipped: piece.skipped };
    }
    lineAnchor ||= token === '$' && !inClass;
    inClass = CLASS_STATE.get(token) ?? inClass;
    text += piece.text;
  }
  return { pattern: text, lineAnchor };
}

function dialectSkip(pattern: string): string | undefined {
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

function defect(message: Message): Defect {
  const hint = hints.get(message.ruleId ?? '') ?? '';
  return {
    rule: message.ruleId ?? '',
    kind: message.ruleId === BACKTRACKING_RULE ? 'backtracking' : 'part',
    description: message.message,
    hint: hint.trimStart(),
    message: `${message.message}${hint}`,
  };
}

function dialectDependent(
  { ruleId }: Message,
  { lineAnchor, loopedGroup }: { readonly lineAnchor: boolean; readonly loopedGroup: boolean },
): boolean {
  return (
    (lineAnchor && ruleId !== null && LINE_ASSERTION_RULES.has(ruleId)) ||
    (loopedGroup && ruleId !== null && BACKREFERENCE_RULES.has(ruleId))
  );
}

function lint(
  { pattern, lineAnchor }: { readonly pattern: string; readonly lineAnchor: boolean },
  flags: string,
): { skipped: string } | { defects: Defect[] } {
  const source = `new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(`u${flags}`)});`;
  const { linter, config } = engine();
  const messages = linter.verify(source, config);
  if (messages.some(({ ruleId }) => ruleId === null || !hints.has(ruleId))) {
    return { skipped: 'syntax outside the shared subset' };
  }
  const loopedGroup = QUANTIFIED_GROUP.test(pattern);
  return {
    defects: messages
      .filter((message) => !dialectDependent(message, { lineAnchor, loopedGroup }))
      .map(defect),
  };
}

export function patternDefects(
  source: string,
  { flags = '', dialect }: { readonly flags?: string; readonly dialect: Dialect },
): { skipped: string } | { defects: Defect[] } | { pattern: string; lineAnchor: boolean } {
  if (!SHARED_FLAGS.test(flags)) {
    return { skipped: `flags ${flags}` };
  }
  const flagged = withInlineFlags(source, flags);
  if (flagged.skipped !== undefined) {
    return { skipped: flagged.skipped };
  }
  const skip = dialectSkip(flagged.pattern);
  if (skip !== undefined) {
    return { skipped: skip };
  }
  const shared = translated(flagged.pattern, {
    dialect,
    multiline: flagged.flags.includes('m'),
    dotAll: flagged.flags.includes('s'),
  });
  return shared.skipped === undefined ? lint(shared, flagged.flags) : { skipped: shared.skipped };
}
