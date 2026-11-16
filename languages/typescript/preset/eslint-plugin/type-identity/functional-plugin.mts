import functional from 'eslint-plugin-functional';
import {
  giveEachInstantiationItsOwnIdentity,
  startIdentityScope,
  type ProgramLike,
} from './recursion-identity.mts';

const preferImmutableTypes = functional.rules['prefer-immutable-types'];

type ImmutableContext = Parameters<typeof preferImmutableTypes.create>[0];
function inOwnIdentityScope(
  program: ProgramLike | undefined,
  listener: (node: never) => void,
): (...nodes: unknown[]) => void {
  return (...nodes) => {
    startIdentityScope(program);
    Reflect.apply(listener, undefined, nodes);
  };
}

function isImmutableContext(context: unknown): context is ImmutableContext {
  return (
    typeof context === 'object' &&
    context !== null &&
    typeof Reflect.get(context, 'report') === 'function' &&
    Array.isArray(Reflect.get(context, 'options'))
  );
}

export const functionalPlugin = {
  ...functional,
  rules: {
    ...functional.rules,
    'prefer-immutable-types': {
      ...preferImmutableTypes,
      create(context: unknown): Record<string, (...nodes: unknown[]) => void> {
        if (!isImmutableContext(context)) {
          return {};
        }
        const program = context.sourceCode.parserServices?.program ?? undefined;
        giveEachInstantiationItsOwnIdentity(program);
        const listeners = preferImmutableTypes.create(context);
        return Object.fromEntries(
          Object.entries(listeners).flatMap(([selector, listener]) =>
            listener === undefined ? [] : [[selector, inOwnIdentityScope(program, listener)]],
          ),
        );
      },
    },
  },
};
