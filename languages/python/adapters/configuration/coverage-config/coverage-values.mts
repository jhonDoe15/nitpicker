const BOOLEAN_KEYS = new Set(['timid', 'cover_pylib', 'sigterm']);
const CHOICES: Readonly<Record<string, readonly string[]>> = {
  core: ['ctrace', 'pytrace', 'sysmon'],
  dynamic_context: ['test_function'],
};
const INI_TRUE = new Set(['1', 'yes', 'true', 'on']);
const INI_FALSE = new Set(['0', 'no', 'false', 'off']);
const WARNING_NAME = /^[\w-]+$/u;

function rejected(
  { file, key, value }: { file: string; key: string; value: unknown },
  expected: string,
): Error {
  return new Error(
    `The coverage config ${file} sets run ${key} = ${JSON.stringify(value)}, but coverage takes ${expected}: fix it, or remove "project" from tools.coverage.precedence`,
  );
}

function booleanValue(file: string, key: string, value: unknown): string {
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
  throw rejected({ file, key, value }, 'true or false');
}

function choiceValue(file: string, key: string, value: unknown): string {
  const word = typeof value === 'string' ? value.trim() : undefined;
  const choices = CHOICES[key] ?? [];
  if (word !== undefined && choices.includes(word)) {
    return word;
  }
  throw rejected({ file, key, value }, choices.join(', '));
}

export function warningNames(file: string, values: string[]): string[] {
  const bad = values.find((entry) => !WARNING_NAME.test(entry));
  if (bad !== undefined) {
    throw rejected({ file, key: 'disable_warnings', value: bad }, 'warning names');
  }
  return values;
}

export function checkedRunValue(file: string, key: string, value: unknown): string {
  return BOOLEAN_KEYS.has(key) ? booleanValue(file, key, value) : choiceValue(file, key, value);
}
