import { stringValue } from '../analysis/constant-resolution.mjs';
import { isEnvRead } from '../database/orm-options.mjs';
import { isAbsent } from '../security/http/http-config.mjs';
import { resolvedValue, staticKey } from '../security/security-values.mjs';

export const SET = 'set';
export const MISSING = 'missing';
export const UNKNOWN = 'unknown';

const TIMEOUT_TEXT = /statement_timeout|query_timeout/u;
const MAX_SPREADS = 4;

export function either(states) {
  if (states.includes(SET)) {
    return SET;
  }
  return states.includes(UNKNOWN) ? UNKNOWN : MISSING;
}

export function textOf(context, node) {
  const value = resolvedValue(context, node);
  if (value?.type === 'TemplateLiteral') {
    return value.quasis.map((quasi) => quasi.value.cooked ?? '').join(' ');
  }
  return stringValue(value);
}

export function textState(context, node, unknownText) {
  const text = textOf(context, node);
  if (text === undefined) {
    return unknownText;
  }
  return TIMEOUT_TEXT.test(text) ? SET : MISSING;
}

function flatEntries(context, node, depth) {
  const object = resolvedValue(context, node);
  if (object?.type !== 'ObjectExpression' || depth > MAX_SPREADS) {
    return undefined;
  }
  const options = { entries: [], opaque: false };
  for (const entry of object.properties) {
    const inner =
      entry.type === 'SpreadElement' ? flatEntries(context, entry.argument, depth + 1) : undefined;
    if (inner !== undefined) {
      options.entries.push(...inner.entries);
      options.opaque ||= inner.opaque;
    } else if (entry.type === 'Property' && staticKey(entry) !== undefined) {
      options.entries.push(entry);
    } else {
      options.opaque = true;
    }
  }
  return options;
}

export function optionsOf(context, node) {
  return node === undefined ? undefined : flatEntries(context, node, 0);
}

export function valueOf(options, key) {
  return options.entries.findLast((entry) => staticKey(entry) === key)?.value;
}

export function absentState(options) {
  return options.opaque ? UNKNOWN : MISSING;
}

export function keyState(context, options, key) {
  const value = valueOf(options, key);
  if (value === undefined) {
    return absentState(options);
  }
  return isAbsent(context, value) ? MISSING : SET;
}

export function textKeyState(context, options, key, unknownText) {
  const value = valueOf(options, key);
  return value === undefined ? absentState(options) : textState(context, value, unknownText);
}

export function nestedState(context, options, key, judge) {
  const value = valueOf(options, key);
  return value === undefined ? absentState(options) : judge(context, value);
}

export function postgresOptionsState(context, node) {
  if (node === undefined || isEnvRead(node)) {
    return MISSING;
  }
  const text = textOf(context, node);
  if (text !== undefined) {
    return textState(context, node, MISSING);
  }
  const options = optionsOf(context, node);
  if (options === undefined) {
    return UNKNOWN;
  }
  return either([
    keyState(context, options, 'statement_timeout'),
    keyState(context, options, 'query_timeout'),
    textKeyState(context, options, 'options', UNKNOWN),
    textKeyState(context, options, 'connectionString', MISSING),
  ]);
}
