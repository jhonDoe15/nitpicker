import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { hasAssertion, isHelperName, terminalCall } from '../../source/assertions.mjs';
import { definedFunctions, testMethods } from '../../source/test-methods.mjs';
import { isTestSource, TEST_SOURCE_GLOB } from './java-imports.mjs';

const EXTRA_NAMES = /name="extraAssertMethodNames"\s+value="([^"]*)"/;
const SUPPORT_FOLDERS = ['test-support', 'test-utils', 'testkit', 'testing'];
const THROWS = /\bthrow\b/;

export const MIN_FILES = 3;
export const SAMPLE_LIMIT = 1000;
export function testAndSupportGlobs(extension) {
  return [
    `${TEST_SOURCE_GLOB}*.${extension}`,
    `**/{${SUPPORT_FOLDERS.join(',')}}/**/*.${extension}`,
  ];
}

const nitpickerNames = new Map();

export function nitpickerAssertionNames() {
  if (!nitpickerNames.has('names')) {
    const ruleset = readFileSync(path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'), 'utf8');
    nitpickerNames.set('names', (EXTRA_NAMES.exec(ruleset)?.[1] ?? '').split(',').filter(Boolean));
  }
  return nitpickerNames.get('names');
}

function usedAtTheEnd(text, language, extra) {
  return testMethods(text, language)
    .filter(({ body }) => !hasAssertion({ body, language, extra }))
    .map(({ body }) => terminalCall(body, language))
    .filter((name) => name !== undefined && isHelperName(name));
}

function definedAssertions(text, language, extra) {
  return definedFunctions(text, language)
    .filter(({ body }) => hasAssertion({ body, language, extra }) || THROWS.test(body))
    .map(({ name }) => name);
}

export function assertionEvidence(text, file, language) {
  const extra = language === 'kotlin' ? [] : nitpickerAssertionNames();
  const used = isTestSource(file) ? usedAtTheEnd(text, language, extra) : [];
  return [
    ...new Set(used.map((name) => `use:${name}`)),
    ...new Set(definedAssertions(text, language, extra).map((name) => `def:${name}`)),
  ];
}

export function followedHelpers(counts, { minFiles }) {
  return Object.keys(counts)
    .filter((key) => key.startsWith('use:'))
    .map((key) => key.slice('use:'.length))
    .filter((name) => counts[`use:${name}`] >= minFiles)
    .filter((name) => (counts[`def:${name}`] ?? 0) > 0);
}
