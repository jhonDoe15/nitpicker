import { readFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { hasAssertion, isHelperName, terminalCall } from '../../source/assertions.mts';
import { definedFunctions, testMethods } from '../../source/test-methods.mts';
import { isTestSource, TEST_SOURCE_GLOB } from './java-imports.mts';

const EXTRA_NAMES = /name="extraAssertMethodNames"\s+value="([^"]*)"/;
const SUPPORT_FOLDERS = ['test-support', 'test-utils', 'testkit', 'testing'];
const THROWS = /\bthrow\b/;

export const MIN_FILES = 3;
export const SAMPLE_LIMIT = 1000;
export function testAndSupportGlobs(extension: string): string[] {
  return [
    `${TEST_SOURCE_GLOB}*.${extension}`,
    `**/{${SUPPORT_FOLDERS.join(',')}}/**/*.${extension}`,
  ];
}

export function nitpickerAssertionNames(): string[] {
  const ruleset = readFileSync(path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'), 'utf8');
  return (EXTRA_NAMES.exec(ruleset)?.[1] ?? '').split(',').filter(Boolean);
}

function usedAtTheEnd(text: string, language: string, extra: string[]): string[] {
  return testMethods(text, language)
    .filter(({ body }) => !hasAssertion({ body, language, extra }))
    .map(({ body }) => terminalCall(body, language))
    .filter((name): name is string => name !== undefined && isHelperName(name));
}

function definedAssertions(text: string, language: string, extra: string[]): string[] {
  return definedFunctions(text, language)
    .filter(({ body }) => hasAssertion({ body, language, extra }) || THROWS.test(body))
    .map(({ name }) => name);
}

export function assertionEvidence(text: string, file: string, language: string): string[] {
  const extra = language === 'kotlin' ? [] : nitpickerAssertionNames();
  const used = isTestSource(file) ? usedAtTheEnd(text, language, extra) : [];
  return [
    ...new Set(used.map((name) => `use:${name}`)),
    ...new Set(definedAssertions(text, language, extra).map((name) => `def:${name}`)),
  ];
}
