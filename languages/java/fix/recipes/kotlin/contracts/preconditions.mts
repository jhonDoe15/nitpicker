import { kotlinRecipe } from '../shared/kotlin-recipe.mts';
import type { KotlinFound, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { inheritsUnknownMembers } from './call-context.mts';
import {
  ifThrows,
  negated,
  nullCheckedChain,
  shadowsException,
  shadowsStandardCalls,
  throwCall,
} from './precondition-calls.mts';

const ILLEGAL_STATE = 'IllegalStateException';

const DEFAULT_MESSAGES: Readonly<Record<string, string>> = {
  require: '"Failed requirement."',
  check: '"Check failed."',
};

type Replaced = { readonly message: string | undefined; readonly notNull: boolean };

function replacement(call: string, test: string, { message, notNull }: Replaced): string {
  const name = notNull ? `${call}NotNull` : call;
  const lambda = message ?? (notNull ? DEFAULT_MESSAGES[call] : undefined);
  return lambda === undefined ? `${name}(${test})` : `${name}(${test}) { ${lambda} }`;
}

function guard(
  scanned: ScannedKotlin,
  name: string,
  [exception, call]: readonly [string, string],
): KotlinFound[] {
  if (shadowsStandardCalls(scanned.code) || shadowsException(scanned.code, exception)) {
    return [];
  }
  return ifThrows(scanned, exception)
    .map(({ start, end, condition, message }) => {
      const [from, to] = condition;
      const written = scanned.source.slice(from, to);
      const chain = nullCheckedChain(written);
      const test = negated(written, scanned.code.slice(from, to));
      const text = replacement(call, chain ?? test, { message, notNull: chain !== undefined });
      return { rule: name, offset: start, edits: [{ start, end, text }] };
    })
    .filter(
      ({ edits: [first] }) =>
        first !== undefined && !inheritsUnknownMembers(scanned.code, first.start),
    );
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
    return thrown === undefined ||
      thrown.message === undefined ||
      insideGuard(guards, index) ||
      inheritsUnknownMembers(scanned.code, index)
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
