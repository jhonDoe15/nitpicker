import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { hasAssertion, isHelperName, terminalCall } from '../../source/assertions.mjs';
import { testMethods } from '../../source/test-methods.mjs';

const EXTRA_NAMES = /name="extraAssertMethodNames"\s+value="([^"]*)"/;

export const MIN_FILES = 2;

export function nitpickerAssertionNames() {
  const ruleset = readFileSync(path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'), 'utf8');
  return (EXTRA_NAMES.exec(ruleset)?.[1] ?? '').split(',').filter(Boolean);
}

export function assertionHelpers(text, language) {
  const extra = language === 'kotlin' ? [] : nitpickerAssertionNames();
  const names = testMethods(text, language)
    .filter(({ body }) => !hasAssertion({ body, language, extra }))
    .map(({ body }) => terminalCall(body, language))
    .filter((name) => name !== undefined && isHelperName(name));
  return [...new Set(names)];
}
