import path from 'node:path';
import { configError, isPlainObject, validateStringArray } from '../../shared/config.mjs';

const LAYOUT_KEYS = ['sourceRoots', 'testRoots', 'excludedGlobs', 'entryPoints'];
const GLOB_LAYOUT_KEYS = ['excludedGlobs', 'entryPoints'];

export function validateLayout(layout) {
  if (!isPlainObject(layout)) {
    throw configError('"layout" must be an object');
  }
  for (const [key, value] of Object.entries(layout)) {
    validateLayoutEntry(key, value);
  }
}

function validateLayoutEntry(key, value) {
  if (!LAYOUT_KEYS.includes(key)) {
    throw configError(
      `unknown layout key "${key}". Allowed layout keys: ${LAYOUT_KEYS.join(', ')}`,
    );
  }
  validateStringArray(value, `layout.${key}`);
  if (GLOB_LAYOUT_KEYS.includes(key)) {
    return;
  }
  if (value.length === 0) {
    throw configError(`"layout.${key}" must not be empty`);
  }
  const outside = value.find((root) => !isProjectRelativeDirectory(root));
  if (outside !== undefined) {
    throw configError(`"layout.${key}" entries must be directories inside the project: ${outside}`);
  }
}

function isProjectRelativeDirectory(root) {
  const normalized = root.replaceAll('\\', '/');
  return (
    !path.isAbsolute(normalized) &&
    !/^[A-Za-z]:/.test(normalized) &&
    !/[*?{}[\]]/.test(normalized) &&
    !normalized.split('/').includes('..') &&
    normalized.replace(/^\.\/?|\/$/g, '').length > 0
  );
}
