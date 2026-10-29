const BOOLEAN_KEYS = new Set(['timid', 'cover_pylib', 'sigterm']);
const CHOICES = { core: ['ctrace', 'pytrace', 'sysmon'], dynamic_context: ['test_function'] };
const INI_TRUE = new Set(['1', 'yes', 'true', 'on']);
const INI_FALSE = new Set(['0', 'no', 'false', 'off']);
const WARNING_NAME = /^[\w-]+$/u;

function rejected(file, key, value, expected) {
  return new Error(
    `The coverage config ${file} sets run ${key} = ${JSON.stringify(value)}, but coverage takes ${expected}: fix it, or remove "project" from tools.coverage.precedence`,
  );
}

function booleanValue(file, key, value) {
  if (typeof value === 'boolean') {
    return value ? 'True' : 'False';
  }
  const word = String(value).trim().toLowerCase();
  if (INI_TRUE.has(word)) {
    return 'True';
  }
  if (INI_FALSE.has(word)) {
    return 'False';
  }
  throw rejected(file, key, value, 'true or false');
}

function choiceValue(file, key, value) {
  const word = typeof value === 'string' ? value.trim() : undefined;
  if (CHOICES[key].includes(word)) {
    return word;
  }
  throw rejected(file, key, value, CHOICES[key].join(', '));
}

export function warningNames(file, values) {
  const bad = values.find((entry) => !WARNING_NAME.test(entry));
  if (bad !== undefined) {
    throw rejected(file, 'disable_warnings', bad, 'warning names');
  }
  return values;
}

export function checkedRunValue(file, key, value) {
  return BOOLEAN_KEYS.has(key) ? booleanValue(file, key, value) : choiceValue(file, key, value);
}
