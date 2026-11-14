import { escapeRegExp } from '../../../../../../../shared/paths/glob.mjs';
import { braceDepths } from '../../kotlin-source.mjs';
import {
  classBodies,
  isCloseName,
  memberFunctions,
  memberProperties,
  statementsOf,
} from './kotlin-scopes.mjs';

export function scopesOf(code) {
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

export function closeHandles(scope, name, verbs) {
  const { code } = scope;
  const mentions = new RegExp(String.raw`\b${escapeRegExp(name)}\b`);
  return scope.closers.some((closer) => {
    const called = new Set(
      [...code.slice(closer.open, closer.end).matchAll(/(?<![\w.])([A-Za-z_]\w*)\s*\(/g)].map(
        (match) => match[1],
      ),
    );
    return [closer, ...scope.functions.filter((fn) => called.has(fn.name))].some((fn) =>
      statementsOf(code, fn).some(({ text }) => verbs.test(text) && mentions.test(text)),
    );
  });
}
