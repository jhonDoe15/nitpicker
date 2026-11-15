import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type { SourceCode } from '../../typed/node-views.mts';
import {
  equalitySides,
  methodCallOn,
  numberValue,
  outerOf,
  referencesName,
  repeatedRole,
  returnedExpression,
  singleParameter,
  unwrapped,
  type MethodUse,
} from './repeated-runs.mts';

type Use = 'append' | 'neutral' | 'positional' | 'test';
type Finding = TSESLint.ReportDescriptor<'arrayAsSet'>;

const NEUTRAL = 'neutral';
const POSITIONAL_USE = 'positional';

const APPENDS = new Set(['push', 'unshift']);
const POSITIONAL = new Set([
  'at',
  'copyWithin',
  'fill',
  'findIndex',
  'findLastIndex',
  'lastIndexOf',
  'pop',
  'reverse',
  'shift',
  'sort',
  'splice',
  'toSpliced',
  'with',
]);
const ABSENT = -1;
const PRESENCE_OPERATORS = new Set(['===', '!==', '==', '!=', '<', '>=', '>', '<=']);

function isArrayLiteral(init: TSESTree.Node | undefined): boolean {
  const value = init === undefined ? undefined : unwrapped(init);
  if (value?.type === AST_NODE_TYPES.ArrayExpression) {
    return true;
  }
  return (
    value?.type === AST_NODE_TYPES.NewExpression &&
    value.callee.type === AST_NODE_TYPES.Identifier &&
    value.callee.name === 'Array' &&
    value.arguments.length === 0
  );
}

function isPresenceTest(call: TSESTree.CallExpression): boolean {
  const comparison = outerOf(call).parent;
  if (
    comparison?.type !== AST_NODE_TYPES.BinaryExpression ||
    !PRESENCE_OPERATORS.has(comparison.operator)
  ) {
    return false;
  }
  const other = comparison.left === outerOf(call) ? comparison.right : comparison.left;
  return numberValue(other) === ABSENT || numberValue(other) === 0;
}

function isIdentityCallback(fn: TSESTree.Node | undefined): boolean {
  const name = singleParameter(fn);
  const sides = name === undefined ? undefined : equalitySides(returnedExpression(fn));
  if (name === undefined || sides === undefined) {
    return false;
  }
  const own = unwrapped(sides[0]);
  const other = unwrapped(sides[1]);
  return (
    (own.type === AST_NODE_TYPES.Identifier && own.name === name && !referencesName(other, name)) ||
    (other.type === AST_NODE_TYPES.Identifier && other.name === name && !referencesName(own, name))
  );
}

function isSpreadAppend(reference: TSESLint.Scope.Reference, name: string): boolean {
  const assignment = reference.identifier.parent;
  if (
    assignment.type !== AST_NODE_TYPES.AssignmentExpression ||
    assignment.left !== reference.identifier
  ) {
    return false;
  }
  const value = unwrapped(assignment.right);
  return (
    value.type === AST_NODE_TYPES.ArrayExpression &&
    value.elements.length > 1 &&
    value.elements.some(
      (element) =>
        element?.type === AST_NODE_TYPES.SpreadElement &&
        element.argument.type === AST_NODE_TYPES.Identifier &&
        element.argument.name === name,
    )
  );
}

function memberUse({ name, call, member }: MethodUse): Use {
  if (member !== undefined) {
    return member.computed && name === undefined ? POSITIONAL_USE : NEUTRAL;
  }
  if (name !== undefined && APPENDS.has(name)) {
    return 'append';
  }
  if (name !== undefined && POSITIONAL.has(name)) {
    return POSITIONAL_USE;
  }
  if (name === 'includes' || (name === 'some' && isIdentityCallback(call.arguments[0]))) {
    return 'test';
  }
  if (name === 'indexOf') {
    return isPresenceTest(call) ? 'test' : POSITIONAL_USE;
  }
  return NEUTRAL;
}

function useOf(reference: TSESLint.Scope.Reference, name: string): Use {
  if (reference.isWrite()) {
    return isSpreadAppend(reference, name) ? 'append' : NEUTRAL;
  }
  const method = methodCallOn(reference.identifier);
  return method === undefined ? NEUTRAL : memberUse(method);
}

function isExported(declarator: TSESTree.VariableDeclarator): boolean {
  return declarator.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration;
}

export function arrayMembership(
  sourceCode: SourceCode,
  declarator: TSESTree.VariableDeclarator,
): Finding | undefined {
  const { id } = declarator;
  if (id.type !== AST_NODE_TYPES.Identifier || !isArrayLiteral(declarator.init ?? undefined)) {
    return undefined;
  }
  const [variable] = sourceCode.getDeclaredVariables(declarator);
  if (variable === undefined || variable.defs[0]?.node !== declarator || isExported(declarator)) {
    return undefined;
  }
  const uses = variable.references
    .filter((reference) => !reference.init)
    .map((reference) => ({ reference, use: useOf(reference, id.name) }));
  if (uses.some(({ use }) => use === POSITIONAL_USE) || !uses.some(({ use }) => use === 'append')) {
    return undefined;
  }
  const test = uses.find(
    ({ reference, use }) =>
      use === 'test' &&
      repeatedRole(reference.identifier, declarator.parent, { recursion: true }) !== undefined,
  );
  if (test === undefined) {
    return undefined;
  }
  const method = methodCallOn(test.reference.identifier);
  return {
    node: test.reference.identifier,
    messageId: 'arrayAsSet',
    data: { name: id.name, method: method?.name },
  };
}
