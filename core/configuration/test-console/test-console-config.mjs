import {
  configError,
  isNonEmptyString,
  isPlainObject,
  validateStringArray,
} from '../../../shared/config.mjs';
import { hasSpecificText } from '../../../shared/console/console-messages.mjs';

const TEST_CONSOLE_KEYS = ['allow'];

const ALLOW_KEYS = ['contains', 'paths', 'reason'];

export function validateTestConsole(testConsole) {
  if (testConsole === undefined) {
    return;
  }
  if (!isPlainObject(testConsole)) {
    throw configError('"testConsole" must be an object');
  }
  for (const key of Object.keys(testConsole)) {
    if (!TEST_CONSOLE_KEYS.includes(key)) {
      throw configError(
        `unknown testConsole key "${key}". Allowed testConsole keys: ${TEST_CONSOLE_KEYS.join(', ')}`,
      );
    }
  }
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
  }
  if (!isNonEmptyString(entry.reason) || entry.reason.trim().length === 0) {
    throw configError(`"${label}.reason" is required: say which library prints this and why`);
  }
}
