import { readFileSync } from 'node:fs';
import { qualifiedName, sourceOfType } from './integration-tests.mjs';
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
  const pending = [{ text, className: testCase.className }];
  for (const current of pending) {
    const written = superclassOf(current.text, current.className);
    const className = written === undefined ? undefined : qualifiedName(current.text, written);
    const found =
      className === undefined ? undefined : sourceOfType(locate, projectRoot, className);
    const superText = found === undefined ? undefined : readFileSync(found.file, 'utf8');
    const method =
      superText === undefined ? undefined : testMethod(superText, testCase.name, className);
    if (method !== undefined) {
      return { source: found.relative, className, method };
    }
    if (superText !== undefined && pending.length < MAX_LEVELS) {
      pending.push({ text: superText, className });
    }
  }
  return undefined;
}
