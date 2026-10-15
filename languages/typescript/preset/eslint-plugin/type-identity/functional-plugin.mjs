import functional from 'eslint-plugin-functional';
import ts from 'typescript';

const MAX_TYPE_ARGUMENT_DEPTH = 12;
const patchedCheckers = new WeakSet();

function typeArgumentDepth(checker, type) {
  if ((type.objectFlags & ts.ObjectFlags.Reference) === 0) return 0;
  const depths = checker
    .getTypeArguments(type)
    .map((argument) => typeArgumentDepth(checker, argument));
  return 1 + Math.max(0, ...depths);
}

function giveEachInstantiationItsOwnIdentity(program) {
  const checker = program?.getTypeChecker();
  if (checker === undefined || patchedCheckers.has(checker)) return;
  patchedCheckers.add(checker);
  const sharedIdentity = checker.getRecursionIdentity.bind(checker);
  checker.getRecursionIdentity = (type) =>
    typeArgumentDepth(checker, type) > MAX_TYPE_ARGUMENT_DEPTH ? sharedIdentity(type) : type;
}

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
