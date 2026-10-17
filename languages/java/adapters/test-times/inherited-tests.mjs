import { readFileSync } from 'node:fs';
import { qualifiedName, sourceOfType } from './spring-boot-tests.mjs';
import { testMethod } from './test-methods.mjs';

const MAX_LEVELS = 10;
const REGEXP_SPECIALS = /[$]/gu;

export function superclassOf(text, className) {
  const simple = className.split('.').pop().split('$').pop().replaceAll(REGEXP_SPECIALS, '\\$&');
  const declaration = new RegExp(
    String.raw`\bclass\s+${simple}\b(?:<[^{]*?>)?[^{]*?(?:\bextends\s+([\w.]+)|:\s*([\w.]+)\s*\()`,
    'u',
  ).exec(text);
  return declaration?.[1] ?? declaration?.[2];
}

export function inheritedMethod({ text, testCase, locate, projectRoot }) {
  let current = { text, className: testCase.className };
  for (let level = 0; level < MAX_LEVELS; level += 1) {
    const written = superclassOf(current.text, current.className);
    const found =
      written === undefined
        ? undefined
        : sourceOfType(locate, projectRoot, qualifiedName(current.text, written));
    if (found === undefined) {
      return undefined;
    }
    const className = qualifiedName(current.text, written);
    const superText = readFileSync(found.file, 'utf8');
    const method = testMethod(superText, testCase.name, className);
    if (method !== undefined) {
      return { source: found.relative, className, method };
    }
    current = { text: superText, className };
  }
  return undefined;
}
