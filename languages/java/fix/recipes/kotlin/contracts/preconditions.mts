import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';
import {
  ifThrows,
  negated,
  shadowsException,
  shadowsStandardCalls,
  throwCall,
} from './precondition-calls.mts';

const ILLEGAL_STATE = 'IllegalStateException';

function guard(
  scanned: ScannedKotlin,
  name: string,
  [exception, call]: readonly [string, string],
): KotlinFound[] {
  if (shadowsStandardCalls(scanned.code) || shadowsException(scanned.code, exception)) {
    return [];
  }
  return ifThrows(scanned, exception).map(({ start, end, condition, message }) => {
    const [from, to] = condition;
    const test = negated(scanned.source.slice(from, to), scanned.code.slice(from, to));
    const text = message === undefined ? `${call}(${test})` : `${call}(${test}) { ${message} }`;
    return { rule: name, offset: start, edits: [{ start, end, text }] };
  });
}

function insideGuard(guards: readonly KotlinFound[], offset: number): boolean {
  return guards.some(
    ({ edits: [first] }) => first !== undefined && offset >= first.start && offset < first.end,
  );
}

function throws(scanned: ScannedKotlin, guards: readonly KotlinFound[]): KotlinFound[] {
  if (shadowsStandardCalls(scanned.code) || shadowsException(scanned.code, ILLEGAL_STATE)) {
    return [];
  }
  return [
    ...scanned.code.matchAll(/(?<![\w.])throw\s+(?:java\.lang\.)?IllegalStateException\b/gu),
  ].flatMap(({ index }) => {
    const thrown = throwCall(scanned, index, ILLEGAL_STATE);
    return thrown === undefined || thrown.message === undefined || insideGuard(guards, index)
      ? []
      : [
          {
            offset: index,
            edits: [{ start: index, end: thrown.end, text: `error(${thrown.message})` }],
          },
        ];
  });
}

export const useRequireRecipe = kotlinRecipe({
  id: 'kotlin-use-require',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseRequire' }],
  find: (scanned) =>
    guard(scanned, 'detekt.style.UseRequire', ['IllegalArgumentException', 'require']),
});

export const useCheckOrErrorRecipe = kotlinRecipe({
  id: 'kotlin-use-check-or-error',
  keepComments: true,
  rules: [{ tool: 'detekt', rule: 'detekt.style.UseCheckOrError' }],
  find(scanned) {
    const guards = guard(scanned, 'detekt.style.UseCheckOrError', [ILLEGAL_STATE, 'check']);
    return [...guards, ...throws(scanned, guards)];
  },
});
