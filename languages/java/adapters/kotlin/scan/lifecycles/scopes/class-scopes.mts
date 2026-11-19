import { escapeRegExp } from '../../typed/typed-scan.mts';
import { braceDepths } from '../../kotlin-source.mts';
import {
  type Member,
  type Property,
  classBodies,
  isCloseName,
  memberFunctions,
  memberProperties,
  statementsOf,
} from './kotlin-scopes.mts';

export type ClassScope = {
  code: string;
  body: Member;
  functions: Member[];
  properties: Property[];
  closers: Member[];
};

export function scopesOf(code: string): ClassScope[] {
  const depths = braceDepths(code);
  return classBodies(code).map((body) => {
    const functions = memberFunctions(code, body, depths);
    return {
      code,
      body,
      functions,
      properties: memberProperties(code, body, depths),
      closers: functions.filter((fn) => isCloseName(fn.name)),
    };
  });
}

export function closeHandles(scope: ClassScope, name: string, verbs: RegExp): boolean {
  const { code } = scope;
  const mentions = new RegExp(String.raw`\b${escapeRegExp(name)}\b`);
  return scope.closers.some((closer) => {
    const called = new Set(
      [...code.slice(closer.open, closer.end).matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*\(/g)].map(
        (match) => match[1] ?? '',
      ),
    );
    return [closer, ...scope.functions.filter((fn) => called.has(fn.name))].some((fn) =>
      statementsOf(code, fn).some(({ text }) => verbs.test(text) && mentions.test(text)),
    );
  });
}
