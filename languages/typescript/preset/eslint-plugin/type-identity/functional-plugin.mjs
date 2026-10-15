import functional from 'eslint-plugin-functional';
import ts from 'typescript';

const MAX_TYPE_ARGUMENT_DEPTH = 12;
const patchedCheckers = new WeakSet();

function isTypeReference(type) {
  return (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

function nestsTooDeep(checker, type) {
  const levels = [[type]];
  for (const level of levels) {
    const references = level.filter(isTypeReference);
    if (references.length === 0) return false;
    if (levels.length > MAX_TYPE_ARGUMENT_DEPTH) return true;
    levels.push(references.flatMap((reference) => checker.getTypeArguments(reference)));
  }
  return false;
}

function giveEachInstantiationItsOwnIdentity(program) {
  const checker = program?.getTypeChecker();
  if (checker === undefined || patchedCheckers.has(checker)) return;
  patchedCheckers.add(checker);
  const sharedIdentity = checker.getRecursionIdentity.bind(checker);
  checker.getRecursionIdentity = (type) =>
    nestsTooDeep(checker, type) ? sharedIdentity(type) : type;
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
