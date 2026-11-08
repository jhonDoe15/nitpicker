import { stringValue } from '../analysis/constant-resolution.mjs';
import { isEnvRead } from '../database/orm-options.mjs';
import { isAbsent } from '../security/http/http-config.mjs';
import { resolvedValue, staticKey } from '../security/security-values.mjs';

export const SET = 'set';
export const MISSING = 'missing';
export const UNKNOWN = 'unknown';

const TIMEOUT_KEYS = ['statement_timeout', 'query_timeout'];
const ZERO_VALUE = /^0+(?:ms|s)?$/u;
const SEPARATORS = new Set([' ', '\t', '=', ':', "'", '"']);
const MAX_SPREADS = 4;
const SPREAD_ROUNDS = Array.from({ length: MAX_SPREADS }, (_, round) => round);

export function either(states) {
  if (states.includes(SET)) {
    return SET;
  }
  return states.includes(UNKNOWN) ? UNKNOWN : MISSING;
}

function isConcatenation(node) {
  return node?.type === 'BinaryExpression' && node.operator === '+';
}

function pieceText(piece) {
  if (piece?.type === 'TemplateLiteral') {
    const text = piece.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
    return { text, complete: piece.expressions.length === 0 };
  }
  const text = stringValue(piece);
  return { text: text ?? '', complete: text !== undefined };
}

function visibleText(context, node) {
  const pieces = SPREAD_ROUNDS.reduce(
    (current) =>
      current.flatMap((piece) =>
        isConcatenation(piece)
          ? [resolvedValue(context, piece.left), resolvedValue(context, piece.right)]
          : [piece],
      ),
    [resolvedValue(context, node)],
  ).map(pieceText);
  return {
    text: pieces.map((piece) => piece.text).join(''),
    complete: pieces.every((piece) => piece.complete),
  };
}

export function textOf(context, node) {
  const visible = visibleText(context, node);
  return visible.complete ? visible.text : undefined;
}

function settingValue(rest) {
  const decoded = rest.replaceAll(/%3D/giu, '=');
  const first = [...decoded].findIndex((char) => !SEPARATORS.has(char));
  return first === -1 ? '' : (/^[\w.]*/u.exec(decoded.slice(first))?.[0] ?? '');
}

export function carriesTimeout(text) {
  return TIMEOUT_KEYS.some((key) =>
    text
      .split(key)
      .slice(1)
      .some((rest) => !ZERO_VALUE.test(settingValue(rest))),
  );
}

export function textState(context, node, unknownText) {
  const visible = visibleText(context, node);
  if (carriesTimeout(visible.text)) {
    return SET;
  }
  return visible.complete ? MISSING : unknownText;
}

function spreadItems(context, items, options) {
  return items.flatMap((entry) => {
    if (entry.type !== 'SpreadElement') {
      return [entry];
    }
    const inner = resolvedValue(context, entry.argument);
    if (inner?.type === 'ObjectExpression') {
      return inner.properties;
    }
    options.opaque = true;
    return [];
  });
}

export function optionsOf(context, node) {
  const object = node === undefined ? undefined : resolvedValue(context, node);
  if (object?.type !== 'ObjectExpression') {
    return undefined;
  }
  const options = { context, entries: [], opaque: false };
  const items = SPREAD_ROUNDS.reduce(
    (current) => spreadItems(context, current, options),
    object.properties,
  );
  for (const entry of items) {
    if (entry.type === 'Property' && staticKey(entry) !== undefined) {
      options.entries.push(entry);
    } else {
      options.opaque = true;
    }
  }
  return options;
}

export function valueOf(options, key) {
  return options.entries.findLast((entry) => staticKey(entry) === key)?.value;
}

function absentState(options) {
  return options.opaque ? UNKNOWN : MISSING;
}

export function keyState(options, key) {
  const value = valueOf(options, key);
  if (value === undefined) {
    return absentState(options);
  }
  return isAbsent(options.context, value) ? MISSING : SET;
}

function textKeyState(options, key, unknownText) {
  const value = valueOf(options, key);
  return value === undefined
    ? absentState(options)
    : textState(options.context, value, unknownText);
}

export function nestedState(options, key, judge) {
  const value = valueOf(options, key);
  return value === undefined ? absentState(options) : judge(options.context, value);
}

export function postgresOptionsState(context, node) {
  if (node === undefined || isEnvRead(node)) {
    return MISSING;
  }
  if (textOf(context, node) !== undefined) {
    return textState(context, node, MISSING);
  }
  const options = optionsOf(context, node);
  if (options === undefined) {
    return UNKNOWN;
  }
  return either([
    keyState(options, 'statement_timeout'),
    keyState(options, 'query_timeout'),
    textKeyState(options, 'options', UNKNOWN),
    textKeyState(options, 'connectionString', MISSING),
  ]);
}
