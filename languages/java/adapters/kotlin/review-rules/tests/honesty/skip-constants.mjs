import { classesOf } from '../discovery/declarations.mjs';
import { functionOwners, functionsOf } from '../discovery/functions.mjs';

export const DISABLING_BASE = Object.freeze(['Disabled', 'Ignore', 'Ignored']);
const CONSTANT_BODY = /^(?:return\s+)?(true|false)$/u;
const CONSTANT_TEXT = /^(?:#\{\s*)?(true|false)(?:\s*\})?$/u;
const CONST_VAL = /(?:^|\s)val\s+([A-Za-z_]\w*)(?:\s*:\s*Boolean)?\s*=\s*(true|false)\b/gmu;
const STRING_ARGUMENT = /"([^"]*)"/u;
const CLASS_ARGUMENT = /([\w.]+)::class/u;
const ENABLED_ASSIGNMENT = /\benabled\s*=\s*([^,)\n]+)/u;
const ENABLED_IF = /\benabledIf\s*=\s*\{([^}]*)\}/u;
const REASON_IF = /\benabledOrReasonIf\s*=\s*\{([^}]*)/u;
const LAMBDA_PARAMS = /^[\w, ]*->/u;
const DISABLED_REASON = /^Enabled\s*\.\s*disabled\s*\(/u;
const NO_INVOCATIONS = /\binvocations\s*=\s*0\b/u;
const POSITIONAL_FALSE = /^\s*false\s*(?:,|$)/u;

export function constantBoolean(text, constants = new Map()) {
  const trimmed = text.trim();
  const negations = trimmed.match(/^!+/u)?.[0].length ?? 0;
  const rest = trimmed.slice(negations).trim();
  const known = rest === 'true' || rest === 'false' ? rest === 'true' : constants.get(rest);
  return known === undefined ? undefined : known !== (negations % 2 === 1);
}

export function constantValues(scanned) {
  const values = new Map();
  const conflicting = new Set();
  for (const match of scanned.code.matchAll(CONST_VAL)) {
    if (values.has(match[1]) && values.get(match[1]) !== (match[2] === 'true')) {
      conflicting.add(match[1]);
    }
    values.set(match[1], match[2] === 'true');
  }
  return new Map([...values].filter(([name]) => !conflicting.has(name)));
}

function lambdaBody(text) {
  const trimmed = text.trim();
  return trimmed.slice(LAMBDA_PARAMS.exec(trimmed)?.[0].length ?? 0).trim();
}

export function disablesByConfig(config, constants) {
  const assigned = ENABLED_ASSIGNMENT.exec(config)?.[1];
  const enabledIf = ENABLED_IF.exec(config)?.[1];
  const lambda = enabledIf === undefined ? undefined : lambdaBody(enabledIf);
  const reason = REASON_IF.exec(config)?.[1];
  return (
    POSITIONAL_FALSE.test(config) ||
    NO_INVOCATIONS.test(config) ||
    (reason !== undefined && DISABLED_REASON.test(lambdaBody(reason))) ||
    (assigned !== undefined && constantBoolean(assigned, constants) === false) ||
    (lambda !== undefined && constantBoolean(lambda, constants) === false)
  );
}

function bodyConstant(text) {
  const value = CONSTANT_BODY.exec(text.trim())?.[1];
  return value === undefined ? undefined : value === 'true';
}

function companionOwner(klass, classes) {
  return klass.modifiers.has('companion')
    ? classes
        .filter((outer) => outer.bodyOpen < klass.offset && klass.offset < outer.bodyClose)
        .at(-1)
    : undefined;
}

function conditionEntries(scanned) {
  const classes = classesOf(scanned);
  const owners = functionOwners(scanned);
  return functionsOf(scanned).flatMap((fn) => {
    const value = bodyConstant(scanned.code.slice(fn.body.start, fn.body.end));
    const owner = owners.get(fn.offset);
    return value === undefined || owner === undefined
      ? []
      : [{ fn, owner, value, companion: companionOwner(owner, classes) }];
  });
}

export function conditionIndex(scanned) {
  const entries = conditionEntries(scanned);
  const methods = new Map(
    entries.flatMap(({ fn, owner, value, companion }) =>
      [owner, companion]
        .filter((klass) => klass !== undefined)
        .map((klass) => [`${klass.offset}:${fn.name}`, value]),
    ),
  );
  const enabled = new Map(
    entries
      .filter(({ fn }) => fn.name === 'enabled')
      .map(({ owner, value }) => [owner.name, value]),
  );
  return { methods, enabled };
}

export function conditionValue(args, context) {
  const { index, chain } = context;
  const text = STRING_ARGUMENT.exec(args)?.[1];
  if (text !== undefined) {
    const literal = CONSTANT_TEXT.exec(text.trim());
    const named = chain.map((klass) => index.methods.get(`${klass.offset}:${text}`));
    return literal === null ? named.find((value) => value !== undefined) : literal[1] === 'true';
  }
  const klass = CLASS_ARGUMENT.exec(args)?.[1];
  return klass === undefined ? undefined : index.enabled.get(klass.split('.').at(-1));
}
