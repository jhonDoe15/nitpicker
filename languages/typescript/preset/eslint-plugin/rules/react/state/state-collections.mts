import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, scopeChain, type SourceCode } from '../../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../../typed/syntax-views.mts';

type CollectionKind = 'array' | 'set' | 'map';

const MUTATORS: Readonly<Record<CollectionKind, ReadonlySet<string>>> = {
  array: new Set([
    'push',
    'pop',
    'shift',
    'unshift',
    'splice',
    'sort',
    'reverse',
    'fill',
    'copyWithin',
  ]),
  set: new Set(['add', 'delete', 'clear']),
  map: new Set(['set', 'delete', 'clear']),
};
const NAMED_COLLECTIONS = new Map<string | undefined, CollectionKind>([
  ['Array', 'array'],
  ['Set', 'set'],
  ['Map', 'map'],
]);
const EMPTY_TYPES = new Set<string>([
  AST_NODE_TYPES.TSNullKeyword,
  AST_NODE_TYPES.TSUndefinedKeyword,
]);

function builtIn(sourceCode: SourceCode, name: TSESTree.Node): CollectionKind | undefined {
  const text = nameOf(name);
  const isDeclared =
    text !== undefined &&
    scopeChain(sourceCode.getScope(name)).some(
      (scope) => (scope.set.get(text)?.defs.length ?? 0) > 0,
    );
  return isDeclared ? undefined : NAMED_COLLECTIONS.get(text);
}

function kindOfType(
  sourceCode: SourceCode,
  type: TSESTree.TypeNode | undefined,
): CollectionKind | undefined {
  if (type === undefined) {
    return undefined;
  }
  if (type.type === AST_NODE_TYPES.TSArrayType || type.type === AST_NODE_TYPES.TSTupleType) {
    return 'array';
  }
  if (type.type === AST_NODE_TYPES.TSTypeReference) {
    return builtIn(sourceCode, type.typeName);
  }
  if (type.type === AST_NODE_TYPES.TSUnionType) {
    const members = type.types.filter((member) => !EMPTY_TYPES.has(member.type));
    return members.length === 1 ? kindOfType(sourceCode, members[0]) : undefined;
  }
  return undefined;
}

function kindOfValue(
  sourceCode: SourceCode,
  value: TSESTree.Node | undefined,
): CollectionKind | undefined {
  const plain = value === undefined ? undefined : unwrapOf(value, TYPE_ASSERTIONS);
  if (plain?.type === AST_NODE_TYPES.ArrayExpression) {
    return 'array';
  }
  if (plain?.type === AST_NODE_TYPES.NewExpression) {
    return builtIn(sourceCode, plain.callee);
  }
  return plain?.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    plain.body.type !== AST_NODE_TYPES.BlockStatement
    ? kindOfValue(sourceCode, plain.body)
    : undefined;
}

export function stateMutators(
  sourceCode: SourceCode,
  stateCall: TSESTree.CallExpression,
): ReadonlySet<string> {
  const kind =
    kindOfType(sourceCode, stateCall.typeArguments?.params[0]) ??
    kindOfValue(sourceCode, stateCall.arguments[0]);
  return kind === undefined ? new Set() : MUTATORS[kind];
}

export function parameterMutators(
  sourceCode: SourceCode,
  parameter: TSESTree.Identifier,
): ReadonlySet<string> {
  const kind = kindOfType(sourceCode, parameter.typeAnnotation?.typeAnnotation);
  return kind === undefined ? new Set() : MUTATORS[kind];
}
