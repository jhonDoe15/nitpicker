import { configError, validateFileGlobs, validateStringArray } from '../../../shared/config.mjs';
import { isPlainObject } from '../views/config-views.mts';
import { isNonEmptyString } from '../views/validation-views.mts';
import { fieldOf, textsOf } from '../../../shared/values/readers.mts';
import { hasSpecificText } from '../../../shared/rules/console/console-messages.mjs';
import { suggestionOrAllowed } from '../../../shared/messages/closest-match.mjs';

export const TEST_CONSOLE_KEYS = ['allow'];

export const ALLOW_KEYS = ['contains', 'paths', 'reason'];

export function validateScope(name: string, scope: unknown, keys: readonly string[]): void {
  if (scope === undefined) {
    return;
  }
  if (!isPlainObject(scope)) {
    throw configError(`"${name}" must be an object`);
  }
  for (const key of Object.keys(scope)) {
    if (!keys.includes(key)) {
      throw configError(
        `unknown ${name} key "${key}"${suggestionOrAllowed(key, keys, `Allowed ${name} keys`)}`,
      );
    }
  }
  if (scope['enabled'] !== undefined && typeof scope['enabled'] !== 'boolean') {
    throw configError(`"${name}.enabled" must be true or false`);
  }
}

export function validateTestConsole(testConsole: unknown): void {
  if (testConsole === undefined) {
    return;
  }
  validateScope('testConsole', testConsole, TEST_CONSOLE_KEYS);
  const allow = fieldOf(testConsole, 'allow');
  if (allow === undefined) {
    return;
  }
  if (!Array.isArray(allow)) {
    throw configError('"testConsole.allow" must be an array');
  }
  for (const [index, entry] of allow.entries()) {
    validateAllowEntry(entry, `testConsole.allow[${String(index)}]`);
  }
}

function validateAllowEntry(entry: unknown, label: string): void {
  if (!isPlainObject(entry)) {
    throw configError(`"${label}" must be an object`);
  }
  for (const key of Object.keys(entry)) {
    if (!ALLOW_KEYS.includes(key)) {
      const hint =
        key === 'pattern'
          ? `: use "contains". Allowed keys: ${ALLOW_KEYS.join(', ')}`
          : suggestionOrAllowed(key, ALLOW_KEYS);
      throw configError(`unknown key "${key}" in "${label}"${hint}`);
    }
  }
  if (typeof entry['contains'] !== 'string' || !hasSpecificText(entry['contains'])) {
    throw configError(
      `"${label}.contains" must keep at least 3 characters once numbers and ids become <n> and <id>`,
    );
  }
  if (entry['paths'] !== undefined) {
    validateStringArray(entry['paths'], `${label}.paths`);
    if (textsOf(entry['paths']).length === 0) {
      throw configError(`"${label}.paths" needs at least one path glob`);
    }
    validateFileGlobs(entry['paths'], `${label}.paths`);
  }
  if (!isNonEmptyString(entry['reason']) || entry['reason'].trim().length === 0) {
    throw configError(`"${label}.reason" is required: say which library prints this and why`);
  }
}
