import functional from 'eslint-plugin-functional';
import { giveEachInstantiationItsOwnIdentity, startIdentityScope } from './recursion-identity.mjs';

const preferImmutableTypes = functional.rules['prefer-immutable-types'];

function inOwnIdentityScope(program, listener) {
  return (...nodes) => {
    startIdentityScope(program);
    return listener(...nodes);
  };
}

export const functionalPlugin = {
  ...functional,
  rules: {
    ...functional.rules,
    'prefer-immutable-types': {
      ...preferImmutableTypes,
      create(context) {
        const program = context.sourceCode.parserServices?.program;
        giveEachInstantiationItsOwnIdentity(program);
        const listeners = preferImmutableTypes.create(context);
        return Object.fromEntries(
          Object.entries(listeners).map(([selector, listener]) => [
            selector,
            inOwnIdentityScope(program, listener),
          ]),
        );
      },
    },
  },
};
