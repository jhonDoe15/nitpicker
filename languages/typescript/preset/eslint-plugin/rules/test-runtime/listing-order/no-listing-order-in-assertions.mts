import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isExpectCall } from '../../analysis/test-code-analysis.mts';
import { nameOf, variableNamed } from '../../typed/node-views.mts';
import { unwrapOf } from '../../typed/syntax-views.mts';
import {
  type ListingBindings,
  isListingCall,
  listingBindings,
  mocksListing,
  MOCKING_MODULES,
} from './listing-calls.mts';

type Context = Readonly<TSESLint.RuleContext<'listingOrder', []>>;
type Assertion = { readonly node: TSESTree.CallExpression; readonly actual: TSESTree.Node };

const ORDER_KEEPING = new Set(['map', 'filter']);
const REORDERING = new Set(['sort', 'reverse']);
const ORDERED_MATCHERS = new Set(['toEqual', 'toStrictEqual']);
const ORDERED_ASSERTS = new Set(['deepEqual', 'deepStrictEqual']);
const ASSERT_OWNERS = new Set(['assert', 't']);
const MIN_EXPECTED = 2;

const WRAPPERS = [
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.ChainExpression,
];

function unwrap(node: TSESTree.Node): TSESTree.Node {
  return unwrapOf(node, WRAPPERS);
}

function isListingValue(bindings: ListingBindings, node: TSESTree.Node): boolean {
  let value = unwrap(node);
  while (
    !isListingCall(bindings, value) &&
    value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    ORDER_KEEPING.has(nameOf(value.callee.property) ?? '')
  ) {
    value = unwrap(value.callee.object);
  }
  return isListingCall(bindings, value);
}

function isOrderedList(node: TSESTree.Node | undefined): boolean {
  return (
    node?.type === AST_NODE_TYPES.ArrayExpression &&
    node.elements.length >= MIN_EXPECTED &&
    node.elements.every(
      (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
    )
  );
}

function matcherAssertion(call: TSESTree.CallExpression): Assertion | undefined {
  const { callee } = call;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !ORDERED_MATCHERS.has(nameOf(callee.property) ?? '') ||
    !isExpectCall(callee.object) ||
    callee.object.type !== AST_NODE_TYPES.CallExpression ||
    !isOrderedList(call.arguments[0])
  ) {
    return undefined;
  }
  const [actual] = callee.object.arguments;
  return actual === undefined ? undefined : { node: call, actual };
}

function assertAssertion(call: TSESTree.CallExpression): Assertion | undefined {
  const { callee } = call;
  const [actual, expected] = call.arguments;
  const isOrderedAssert =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    ORDERED_ASSERTS.has(nameOf(callee.property) ?? '') &&
    ASSERT_OWNERS.has(nameOf(callee.object) ?? '');
  return isOrderedAssert && actual !== undefined && isOrderedList(expected)
    ? { node: call, actual }
    : undefined;
}

function isReordered(reference: TSESLint.Scope.Reference): boolean {
  const { parent } = reference.identifier;
  if (parent.type === AST_NODE_TYPES.MemberExpression && parent.object === reference.identifier) {
    return REORDERING.has(nameOf(parent.property) ?? '');
  }
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === reference.identifier) &&
    !isExpectCall(parent)
  );
}

function holdsListing(
  context: Context,
  bindings: ListingBindings,
  node: TSESTree.Identifier,
): boolean {
  const variable = variableNamed(context.sourceCode, node);
  const [definition] = variable?.defs ?? [];
  if (
    variable === undefined ||
    variable.defs.length !== 1 ||
    definition?.node.type !== AST_NODE_TYPES.VariableDeclarator ||
    definition.node.id.type !== AST_NODE_TYPES.Identifier ||
    definition.node.init === null
  ) {
    return false;
  }
  const writes = variable.references.filter(
    (reference) => reference.isWrite() && reference.init !== true,
  );
  return (
    writes.length === 0 &&
    isListingValue(bindings, definition.node.init) &&
    !variable.references.some((reference) => reference.isRead() && isReordered(reference))
  );
}

function isUnorderedActual(
  context: Context,
  bindings: ListingBindings,
  node: TSESTree.Node,
): boolean {
  const value = unwrap(node);
  return value.type === AST_NODE_TYPES.Identifier
    ? holdsListing(context, bindings, value)
    : isListingValue(bindings, value);
}

export const rule: TSESLint.RuleModule<'listingOrder'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Sort directory listings and glob results before comparing them with an ordered list',
    },
    schema: [],
    messages: {
      listingOrder:
        'Directory listings and glob results come in the order the file system returns, which differs between file systems and machines, so this ordered comparison passes on one and fails on another. Sort the result first (`.sort()` or `.toSorted()`), or compare without order (`expect.arrayContaining` with a length check, or a `Set`).',
    },
  },
  create(context) {
    const assertions: Assertion[] = [];
    let mocked = false;
    return {
      ImportDeclaration(node) {
        mocked ||= MOCKING_MODULES.has(node.source.value);
      },
      CallExpression(node) {
        mocked ||= mocksListing(node);
        const assertion = matcherAssertion(node) ?? assertAssertion(node);
        if (assertion !== undefined) {
          assertions.push(assertion);
        }
      },
      'Program:exit'(program) {
        const bindings = listingBindings(program, context.sourceCode);
        for (const assertion of mocked ? [] : assertions) {
          if (isUnorderedActual(context, bindings, assertion.actual)) {
            context.report({ node: assertion.node, messageId: 'listingOrder' });
          }
        }
      },
    };
  },
};
