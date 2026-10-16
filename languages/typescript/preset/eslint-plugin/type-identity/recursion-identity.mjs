import ts from 'typescript';

const MAX_TYPE_ARGUMENT_DEPTH = 12;
const SHARED_IDENTITY = Symbol('sharedRecursionIdentity');

function isTypeReference(type) {
  return (type.objectFlags & ts.ObjectFlags.Reference) !== 0;
}

function nestsTooDeep(checker, type) {
  const levels = [[type]];
  for (const level of levels) {
    const references = level.filter(isTypeReference);
    if (references.length === 0) {
      return false;
    }
    if (levels.length > MAX_TYPE_ARGUMENT_DEPTH) {
      return true;
    }
    levels.push(references.flatMap((reference) => checker.getTypeArguments(reference)));
  }
  return false;
}

export function giveEachInstantiationItsOwnIdentity(program) {
  const checker = program?.getTypeChecker();
  if (
    checker === undefined ||
    typeof checker.getRecursionIdentity !== 'function' ||
    SHARED_IDENTITY in checker
  ) {
    return false;
  }
  const sharedIdentity = checker.getRecursionIdentity.bind(checker);
  checker[SHARED_IDENTITY] = sharedIdentity;
  checker.getRecursionIdentity = (type) =>
    nestsTooDeep(checker, type) ? sharedIdentity(type) : type;
  return true;
}
