const NUMERIC_TYPES = new Set([
  'int',
  'long',
  'short',
  'byte',
  'double',
  'float',
  'boolean',
  'Integer',
  'Long',
  'Short',
  'Byte',
  'Double',
  'Float',
  'Boolean',
  'Int',
]);
const DIAGNOSTIC_NAME = /(?:Exception|Error)$/u;
const DIAGNOSTIC_CALLS = new Set(['warn', 'error', 'info', 'debug', 'trace', 'fail']);
const DIAGNOSTIC_OWNERS = /^(?:log|logger|LOG|LOGGER|Assert|Assertions|Preconditions)$/u;
const DIAGNOSTIC_FUNCTIONS = new Set(['require', 'check', 'error', 'checkNotNull']);
const cache = new WeakMap();

function declaredNumbers({ tokens, kotlin }) {
  const names = new Set();
  for (const [index, token] of tokens.entries()) {
    const next = tokens[index + 1];
    if (!kotlin && NUMERIC_TYPES.has(token.text) && next?.kind === 'identifier') {
      names.add(next.text);
    }
    const typed = token.kind === 'identifier' && next?.text === ':';
    if (kotlin && typed && NUMERIC_TYPES.has(tokens[index + 2]?.text)) {
      names.add(token.text);
    }
  }
  return names;
}

export function numericNames(source) {
  if (!cache.has(source)) {
    cache.set(source, declaredNumbers(source));
  }
  return cache.get(source);
}

function isDiagnosticOpener(tokens, open) {
  const callee = tokens[open - 1];
  const owner = tokens[open - 3];
  if (callee?.kind !== 'identifier') {
    return false;
  }
  return (
    DIAGNOSTIC_NAME.test(callee.text) ||
    DIAGNOSTIC_FUNCTIONS.has(callee.text) ||
    (DIAGNOSTIC_CALLS.has(callee.text) && DIAGNOSTIC_OWNERS.test(owner?.text ?? ''))
  );
}

export function isDiagnosticText({ tokens, opener }, index) {
  for (let open = opener[index]; open >= 0; open = opener[open]) {
    if (tokens[open].text === '(' && isDiagnosticOpener(tokens, open)) {
      return true;
    }
  }
  return false;
}
