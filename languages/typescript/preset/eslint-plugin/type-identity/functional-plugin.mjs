import functional from 'eslint-plugin-functional';
import { giveEachInstantiationItsOwnIdentity } from './recursion-identity.mjs';

const preferImmutableTypes = functional.rules['prefer-immutable-types'];

export const functionalPlugin = {
  ...functional,
  rules: {
    ...functional.rules,
    'prefer-immutable-types': {
      ...preferImmutableTypes,
      create(context) {
        giveEachInstantiationItsOwnIdentity(context.sourceCode.parserServices?.program);
        return preferImmutableTypes.create(context);
      },
    },
  },
};
