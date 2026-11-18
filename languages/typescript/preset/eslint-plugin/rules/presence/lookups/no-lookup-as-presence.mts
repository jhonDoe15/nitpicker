import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import type TypeScript from 'typescript';
import { typedScopeOf, type TypedScope } from '../../promises/cannot-reject.mts';
import {
  canBeFalsy,
  includesNullish,
  includesUndefinedOrUnknown,
  isWidePrimitive,
} from '../value-facts.mts';
import { enclosingStatement, plainText, siblingsAfter } from '../conditions.mts';
import { isUnknownIndexTest } from './index-lookups.mts';
import { boundLookup, lookupOf, storeCalls, unwrap, type Lookup } from './map-lookups.mts';
import { onlyStoresNonEmpty } from './stored-values.mts';

type Docs = { readonly requiresTypeChecking: boolean };
type MessageIds = 'cache' | 'index';
type Scope = TypedScope<MessageIds>;
type Kind = 'truthy' | 'undefined' | 'nullish';
type Test = {
  readonly operand: TSESTree.Node;
  readonly kind: Kind;
  readonly missWhenTrue: boolean;
};

const FALSY_FALLBACKS = new Set<unknown>([0, '', false]);

function absentKind(node: TSESTree.Node): 'undefined' | 'null' | undefined {
  if (node.type === AST_NODE_TYPES.Identifier && node.name === 'undefined') {
    return 'undefined';
  }
  return node.type === AST_NODE_TYPES.Literal && node.value === null ? 'null' : undefined;
}

function comparisonTest(node: TSESTree.BinaryExpression): Test | undefined {
  const absent = absentKind(node.right);
  const strict = node.operator === '===' || node.operator === '!==';
  const loose = node.operator === '==' || node.operator === '!=';
  if (absent === undefined || !(strict || loose) || (strict && absent === 'null')) {
    return undefined;
  }
  return {
    operand: node.left,
    kind: strict ? 'undefined' : 'nullish',
    missWhenTrue: node.operator.startsWith('='),
  };
}

function testOf(node: TSESTree.Node): Test | undefined {
  const target = unwrap(node);
  if (target.type === AST_NODE_TYPES.UnaryExpression) {
    return target.operator === '!'
      ? { operand: target.argument, kind: 'truthy', missWhenTrue: true }
      : undefined;
  }
  if (target.type === AST_NODE_TYPES.BinaryExpression) {
    return comparisonTest(target);
  }
  return { operand: target, kind: 'truthy', missWhenTrue: false };
}

function hidesStoredValue(
  kind: Kind,
  valueType: TypeScript.Type,
  checker: TypeScript.TypeChecker,
): boolean {
  switch (kind) {
    case 'truthy':
      return canBeFalsy(valueType, checker);
    case 'undefined':
      return includesUndefinedOrUnknown(valueType);
    case 'nullish':
      return includesNullish(valueType);
  }
}

function exits(branch: TSESTree.Node): boolean {
  const last = branch.type === AST_NODE_TYPES.BlockStatement ? branch.body.at(-1) : branch;
  return (
    last !== undefined &&
    (last.type === AST_NODE_TYPES.ReturnStatement ||
      last.type === AST_NODE_TYPES.ThrowStatement ||
      last.type === AST_NODE_TYPES.ContinueStatement)
  );
}

function missRegion(
  node: TSESTree.IfStatement | TSESTree.ConditionalExpression,
  test: Test,
): TSESTree.Node[] {
  const [taken, other] = [node.consequent, node.alternate];
  if (test.missWhenTrue) {
    return [taken];
  }
  const after = node.type === AST_NODE_TYPES.IfStatement && exits(taken) ? siblingsAfter(node) : [];
  return other === null ? after : [other, ...after];
}

function report(scope: Scope, node: TSESTree.Node, lookup: Lookup): void {
  scope.context.report({
    node,
    messageId: 'cache',
    data: {
      map: plainText(lookup.receiver, scope.sourceCode),
      key: plainText(lookup.key, scope.sourceCode),
    },
  });
}

function storesHiddenValue(
  scope: Scope,
  test: { readonly kind: Kind; readonly lookup: Lookup },
  region: readonly TSESTree.Node[],
): boolean {
  const { kind, lookup } = test;
  const checker = scope.services.program.getTypeChecker();
  const stores = storeCalls(scope, region, lookup);
  const neverEmpty =
    kind === 'truthy' &&
    isWidePrimitive(lookup.valueType, checker) &&
    onlyStoresNonEmpty(stores, region);
  return stores.length > 0 && !neverEmpty && hidesStoredValue(kind, lookup.valueType, checker);
}

function checkBranch(
  scope: Scope,
  node: TSESTree.IfStatement | TSESTree.ConditionalExpression,
): void {
  const test = testOf(node.test);
  const lookup = test === undefined ? undefined : boundLookup(scope, test.operand);
  if (test !== undefined && lookup !== undefined) {
    if (storesHiddenValue(scope, { kind: test.kind, lookup }, missRegion(node, test))) {
      report(scope, node.test, lookup);
    }
  }
}

function isFalsyLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && FALSY_FALLBACKS.has(node.value);
}

function checkFallback(scope: Scope, node: TSESTree.LogicalExpression): void {
  const lookup = node.operator === '&&' ? undefined : lookupOf(scope, node.left);
  if (lookup === undefined || (node.operator === '||' && isFalsyLiteral(node.right))) {
    return;
  }
  const kind = node.operator === '??' ? 'nullish' : 'truthy';
  const region = [node.right, ...siblingsAfter(enclosingStatement(node))];
  if (storesHiddenValue(scope, { kind, lookup }, region)) {
    report(scope, node, lookup);
  }
}

export const rule: TSESLint.RuleModule<MessageIds, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow deciding from a stored Map value or record value whether its key is present',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      cache:
        '`{{map}}.get({{key}})` is tested by its value to decide whether the key is stored, but ' +
        'this map can hold an empty value, which reads as missing and is computed again. ' +
        'Test the key with `has`, then store with `set` when it is missing.',
      index:
        'A record whose values are `unknown` can store `undefined`, so `record[key] !== undefined` ' +
        'cannot tell a missing key from a stored `undefined`. ' +
        'Test the key with `key in record` or `Object.hasOwn(record, key)`.',
    },
  },
  create(context) {
    const scope = typedScopeOf(context);
    if (scope === undefined) {
      return {};
    }
    return {
      IfStatement: (node: TSESTree.IfStatement) => checkBranch(scope, node),
      ConditionalExpression: (node: TSESTree.ConditionalExpression) => checkBranch(scope, node),
      LogicalExpression: (node: TSESTree.LogicalExpression) => checkFallback(scope, node),
      BinaryExpression(node: TSESTree.BinaryExpression) {
        if (isUnknownIndexTest(scope, node)) {
          context.report({ node, messageId: 'index' });
        }
      },
    };
  },
};
