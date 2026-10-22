export function isString(value) {
  return typeof value === 'string';
}

export function isNonEmpty(value) {
  return isString(value) && value.length > 0;
}

export function isLine(value) {
  return Number.isInteger(value) && value > 0;
}

export function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isBoolean(value) {
  return typeof value === 'boolean';
}

export function isStrings(value) {
  return Array.isArray(value) && value.every(isString);
}

export function isProjectPath(value) {
  return (
    isNonEmpty(value) &&
    !value.includes('\\') &&
    !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

export function isRootOrPath(value) {
  return value === '' || isProjectPath(value);
}

export function optional(check) {
  return (value) => value === undefined || check(value);
}

export function oneOf(choices) {
  return (value) => choices.includes(value);
}

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function shapeProblem(shape, item) {
  if (!isRecord(item)) {
    return { field: undefined };
  }
  const [field, check] = Object.entries(shape).find(([key, test]) => !test(item[key])) ?? [];
  return field === undefined ? undefined : { field, check };
}
