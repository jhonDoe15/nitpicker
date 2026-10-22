import {
  configError,
  isNonEmptyString,
  isPlainObject,
  validateFileGlobs,
  validateStringArray,
} from '../../../shared/config.mjs';
import { hasSpecificText } from '../../../shared/rules/console/console-messages.mjs';

const TEST_CONSOLE_KEYS = ['allow'];

const ALLOW_KEYS = ['contains', 'paths', 'reason'];

export function validateScope(name, scope, keys) {
  if (scope === undefined) {
    return;
  }
  if (!isPlainObject(scope)) {
    throw configError(`"${name}" must be an object`);
  }
  for (const key of Object.keys(scope)) {
    if (!keys.includes(key)) {
      throw configError(`unknown ${name} key "${key}". Allowed ${name} keys: ${keys.join(', ')}`);
    }
  }
  if (scope.enabled !== undefined && typeof scope.enabled !== 'boolean') {
    throw configError(`"${name}.enabled" must be true or false`);
  }
}

export function validateTestConsole(testConsole) {
  if (testConsole === undefined) {
    return;
  }
  validateScope('testConsole', testConsole, TEST_CONSOLE_KEYS);
  if (testConsole.allow === undefined) {
    return;
  }
  if (!Array.isArray(testConsole.allow)) {
    throw configError('"testConsole.allow" must be an array');
  }
  for (const [index, entry] of testConsole.allow.entries()) {
    validateAllowEntry(entry, `testConsole.allow[${String(index)}]`);
  }
}

function validateAllowEntry(entry, label) {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!ALLOW_KEYS.includes(key)) {
      const hint = key === 'pattern' ? ': use "contains"' : '';
      throw configError(
        `unknown key "${key}" in "${label}"${hint}. Allowed keys: ${ALLOW_KEYS.join(', ')}`,
      );
    }
  }
  if (typeof entry.contains !== 'string' || !hasSpecificText(entry.contains)) {
    throw configError(
      `"${label}.contains" must keep at least 3 characters once numbers and ids become <n> and <id>`,
    );
  }
  if (entry.paths !== undefined) {
    validateStringArray(entry.paths, `${label}.paths`);
    if (entry.paths.length === 0) {
      throw configError(`"${label}.paths" needs at least one path glob`);
    }
    validateFileGlobs(entry.paths, `${label}.paths`);
  }
  if (!isNonEmptyString(entry.reason) || entry.reason.trim().length === 0) {
    throw configError(`"${label}.reason" is required: say which library prints this and why`);
  }
}
