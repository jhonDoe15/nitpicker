import { readFileSync } from 'node:fs';
import {
  qualifiedName as qualifiedNameUntyped,
  sourceOfType as sourceOfTypeUntyped,
} from './integration-tests.mts';
import type { Locate } from './typed/locate-type.mts';
import { testMethod } from './test-methods.mts';

type SourceFile = { readonly relative: string; readonly file: string };
export type InheritedMethod = {
  readonly source: string;
  readonly className: string;
  readonly method: { readonly line: number; readonly text: string };
};

const qualifiedName: (text: string, name: string) => string = qualifiedNameUntyped;
const sourceOfType: (
  locate: Locate,
  projectRoot: string,
  qualified: string,
) => SourceFile | undefined = sourceOfTypeUntyped;

const MAX_LEVELS = 10;
const REGEXP_SPECIALS = /\$/gu;

export function superclassOf(text: string, className: string): string | undefined {
  const simple =
    (className.split('.').pop() ?? '').split('$').pop()?.replaceAll(REGEXP_SPECIALS, '\\$&') ?? '';
  const declaration = new RegExp(
    String.raw`\bclass\s+${simple}\b(?:<[^{]*?>)?[^{]*?(?:\bextends\s+([\w.]+)|:\s*([\w.]+)\s*\()`,
    'u',
  ).exec(text);
  return declaration?.[1] ?? declaration?.[2];
}

export function inheritedMethod({
  text,
  testCase,
  locate,
  projectRoot,
}: {
  text: string;
  testCase: { readonly className: string; readonly name: string };
  locate: Locate;
  projectRoot: string;
}): InheritedMethod | undefined {
  const pending = [{ text, className: testCase.className }];
  for (const current of pending) {
    const written = superclassOf(current.text, current.className);
    const className = written === undefined ? undefined : qualifiedName(current.text, written);
    const found =
      className === undefined ? undefined : sourceOfType(locate, projectRoot, className);
    const superText = found === undefined ? undefined : readFileSync(found.file, 'utf8');
    const method =
      superText === undefined ? undefined : testMethod(superText, testCase.name, className);
    if (method !== undefined && found !== undefined && className !== undefined) {
      return { source: found.relative, className, method };
    }
    if (superText !== undefined && className !== undefined && pending.length < MAX_LEVELS) {
      pending.push({ text: superText, className });
    }
  }
  return undefined;
}
