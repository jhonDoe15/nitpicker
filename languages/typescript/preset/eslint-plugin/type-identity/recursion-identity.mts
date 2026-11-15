import type TypeScript from 'typescript';
import { memoized } from '../rules/support/memo.mts';
import { ts } from '../rules/typed/typescript-views.mts';

const MAX_TYPE_ARGUMENT_DEPTH = 12;
const SHARED_IDENTITY = Symbol('sharedRecursionIdentity');
const IDENTITY_SCOPE = Symbol('recursionIdentityScope');

export type ProgramLike = { readonly getTypeChecker: () => object };
type Identity = object;
type Scope = WeakMap<Identity, { readonly identity: Identity }>;
type IdentityChecker = TypeScript.TypeChecker & {
  getRecursionIdentity: (type: TypeScript.Type) => Identity;
};

function isScope(value: unknown): value is Scope {
  return value instanceof WeakMap;
}

function isIdentityChecker(checker: object): checker is IdentityChecker {
  return 'getRecursionIdentity' in checker && typeof checker.getRecursionIdentity === 'function';
}

function isTypeReference(type: TypeScript.Type): type is TypeScript.TypeReference {
  return (
    'objectFlags' in type &&
    typeof type.objectFlags === 'number' &&
    (type.objectFlags & ts.ObjectFlags.Reference) !== 0
  );
}

function nestsTooDeep(checker: TypeScript.TypeChecker, type: TypeScript.Type): boolean {
  const levels: TypeScript.Type[][] = [[type]];
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

function currentScope(checker: object): Scope {
  const scope: unknown = Reflect.get(checker, IDENTITY_SCOPE);
  return isScope(scope) ? scope : new WeakMap();
}

function patchedChecker(program: ProgramLike | undefined): object | undefined {
  const checker = program?.getTypeChecker();
  return checker !== undefined && SHARED_IDENTITY in checker ? checker : undefined;
}

export function startIdentityScope(program: ProgramLike | undefined): void {
  const checker = patchedChecker(program);
  if (checker !== undefined) {
    Reflect.set(checker, IDENTITY_SCOPE, new WeakMap());
  }
}

export function giveEachInstantiationItsOwnIdentity(program: ProgramLike | undefined): boolean {
  const checker = program?.getTypeChecker();
  if (checker === undefined || !isIdentityChecker(checker) || SHARED_IDENTITY in checker) {
    return false;
  }
  const sharedIdentity = checker.getRecursionIdentity.bind(checker);
  Reflect.set(checker, SHARED_IDENTITY, sharedIdentity);
  Reflect.set(checker, IDENTITY_SCOPE, new WeakMap());
  checker.getRecursionIdentity = (type: TypeScript.Type) =>
    memoized(
      currentScope(checker),
      nestsTooDeep(checker, type) ? sharedIdentity(type) : type,
      (identity) => ({
        identity,
      }),
    );
  return true;
}
