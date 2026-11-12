import { normalizeGitPath } from '../../git/normalize.mjs';

export { isPlainObject as isRecord } from '../../../../shared/config.mjs';

export function positiveInteger(value, context) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${context} must be a positive integer`);
  }
  return value;
}

export function requiredString(value, context) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new TypeError(`${context} must be a non-empty string`);
  }
  return value;
}

export function normalizeFindingPath(value, context) {
  const normalizedPath = normalizeGitPath(value);
  if (
    normalizedPath === '..' ||
    normalizedPath.startsWith('../') ||
    normalizedPath.startsWith('/') ||
    /^[A-Za-z]:\//.test(normalizedPath)
  ) {
    throw new TypeError(`${context} must stay within the analyzed project`);
  }
  return normalizedPath;
}
