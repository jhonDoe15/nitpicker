import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, nameOf, scopeChain, type SourceCode } from '../../typed/node-views.mts';
import { TYPE_ASSERTIONS, unwrapOf } from '../../typed/syntax-views.mts';

type CollectionKind = 'array' | 'set' | 'map';

const ARRAY = 'array';

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
  ['Array', ARRAY],
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

function singleMember(type: TSESTree.TypeNode): TSESTree.TypeNode | undefined {
  if (type.type !== AST_NODE_TYPES.TSUnionType) {
    return undefined;
  }
  const members = type.types.filter((member) => !EMPTY_TYPES.has(member.type));
  return members.length === 1 ? members[0] : undefined;
}

function kindOfType(
  sourceCode: SourceCode,
  type: TSESTree.TypeNode | undefined,
): CollectionKind | undefined {
  const target = type === undefined ? undefined : chainOf(type, singleMember).at(-1);
  if (target?.type === AST_NODE_TYPES.TSArrayType || target?.type === AST_NODE_TYPES.TSTupleType) {
    return ARRAY;
  }
  return target?.type === AST_NODE_TYPES.TSTypeReference
    ? builtIn(sourceCode, target.typeName)
    : undefined;
}

function expressionBody(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    node.body.type !== AST_NODE_TYPES.BlockStatement
    ? unwrapOf(node.body, TYPE_ASSERTIONS)
    : undefined;
}

function kindOfValue(
  sourceCode: SourceCode,
  value: TSESTree.Node | undefined,
): CollectionKind | undefined {
  const plain =
    value === undefined
      ? undefined
      : chainOf(unwrapOf(value, TYPE_ASSERTIONS), expressionBody).at(-1);
  if (plain?.type === AST_NODE_TYPES.ArrayExpression) {
    return ARRAY;
  }
  return plain?.type === AST_NODE_TYPES.NewExpression
    ? builtIn(sourceCode, plain.callee)
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
