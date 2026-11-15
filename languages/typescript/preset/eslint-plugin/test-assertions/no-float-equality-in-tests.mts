import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { chainOf, isIdentifierNamed } from '../rules/typed/node-views.mts';
import { ASSERTION_WRAPPERS, unwrapOf } from '../rules/typed/syntax-views.mts';
import { moduleBindings } from '../rules/analysis/test-code-analysis.mts';

type Bindings = ReturnType<typeof moduleBindings>;
type NamedMember = TSESTree.MemberExpressionNonComputedName & {
  readonly property: TSESTree.Identifier;
};

const MATCHERS = new Map([
  ['toBe', false],
  ['toEqual', true],
  ['toStrictEqual', true],
  ['equal', false],
  ['equals', false],
  ['eq', false],
  ['eql', true],
  ['eqls', true],
]);
const ASSERT_FUNCTIONS = new Map([
  ['equal', false],
  ['strictEqual', false],
  ['notEqual', false],
  ['notStrictEqual', false],
  ['deepEqual', true],
  ['deepStrictEqual', true],
  ['notDeepEqual', true],
  ['notDeepStrictEqual', true],
]);
const TRUTH_FUNCTIONS = new Set(['ok', 'isTrue', 'isFalse', 'isOk', 'isNotOk']);
const SIGNS = new Set(['-', '+']);
const EQUALITY_OPERATORS = new Set(['===', '==', '!==', '!=']);
const ASSERT_MODULES = new Set([
  'assert',
  'node:assert',
  'assert/strict',
  'node:assert/strict',
  'chai',
  'vitest',
]);
const EXPECT = 'expect';
const ASSERT = 'assert';
const ASSERT_ALIASES = new Set([ASSERT, 'strict']);
const EXPECT_VARIANTS = new Set(['soft', 'poll']);
const MODIFIERS = new Set(['not', 'resolves', 'rejects', 'to', 'be', 'been', 'is', 'deep']);
function isNonIntegral(node: TSESTree.Node): boolean {
  const literal = unwrapOf(node, ASSERTION_WRAPPERS);
  const operand =
    literal.type === AST_NODE_TYPES.UnaryExpression && SIGNS.has(literal.operator)
      ? unwrapOf(literal.argument, ASSERTION_WRAPPERS)
      : literal;
  return (
    operand.type === AST_NODE_TYPES.Literal &&
    typeof operand.value === 'number' &&
    Number.isFinite(operand.value) &&
    !Number.isInteger(operand.value)
  );
}

function nestedValues(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.ArrayExpression) {
    return node.elements.filter(
      (element) => element !== null && element.type !== AST_NODE_TYPES.SpreadElement,
    );
  }
  if (node.type === AST_NODE_TYPES.ObjectExpression) {
    return node.properties
      .filter((property) => property.type === AST_NODE_TYPES.Property)
      .map((p) => p.value);
  }
  return [];
}

function firstFloat(
  candidates: readonly TSESTree.Node[],
  deep: boolean,
): TSESTree.Node | undefined {
  const pending = [...candidates];
  for (const node of pending) {
    if (isNonIntegral(node)) {
      return node;
    }
    if (deep) {
      pending.push(...nestedValues(unwrapOf(node, ASSERTION_WRAPPERS)));
    }
  }
  return undefined;
}

function callbackBodies(call: TSESTree.CallExpression): TSESTree.Node[] {
  return call.arguments.flatMap((argument) =>
    argument.type === AST_NODE_TYPES.ArrowFunctionExpression && argument.expression
      ? [argument.body]
      : [],
  );
}

function conditionParts(node: TSESTree.Node): TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return [node.left, node.right];
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return [
      node.callee,
      ...node.arguments.filter((argument) => argument.type !== AST_NODE_TYPES.SpreadElement),
      ...callbackBodies(node),
    ];
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return [node.object];
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!'
    ? [node.argument]
    : [];
}

function equalityFloat(node: TSESTree.Node): TSESTree.Node | undefined {
  return node.type === AST_NODE_TYPES.BinaryExpression && EQUALITY_OPERATORS.has(node.operator)
    ? [node.left, node.right].find(isNonIntegral)
    : undefined;
}

function comparedFloat(expression: TSESTree.Node): TSESTree.Node | undefined {
  const pending = [expression];
  for (const node of pending) {
    const current = unwrapOf(node, ASSERTION_WRAPPERS);
    const literal = equalityFloat(current);
    if (literal !== undefined) {
      return literal;
    }
    pending.push(...conditionParts(current));
  }
  return undefined;
}

function isMember(node: TSESTree.Node | undefined): node is NamedMember {
  return (
    node?.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier
  );
}

function isExpectCall(node: TSESTree.Node | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (isIdentifierNamed(callee, EXPECT)) {
    return true;
  }
  return (
    isMember(callee) &&
    ((isIdentifierNamed(callee.object, EXPECT) && EXPECT_VARIANTS.has(callee.property.name)) ||
      callee.property.name === EXPECT)
  );
}

function isModifierLink(node: TSESTree.Node): node is NamedMember {
  return isMember(node) && MODIFIERS.has(node.property.name);
}

function expectModifiers(callee: NamedMember): NamedMember[] | undefined {
  const links = chainOf(callee.object, (current) =>
    isModifierLink(current) ? current.object : undefined,
  );
  return isExpectCall(links.at(-1)) ? links.filter(isModifierLink) : undefined;
}

function isStrictLink(node: TSESTree.Node): node is NamedMember {
  return isMember(node) && node.property.name === 'strict';
}

function isAssertOwner(node: TSESTree.Node, bindings: Bindings): boolean {
  const base =
    chainOf(node, (current) => (isStrictLink(current) ? current.object : undefined)).at(-1) ?? node;
  if (base.type === AST_NODE_TYPES.Identifier) {
    return (
      base.name === ASSERT ||
      bindings.namespaces.has(base.name) ||
      ASSERT_ALIASES.has(bindings.named.get(base.name) ?? '')
    );
  }
  return isMember(base) && base.property.name === ASSERT;
}

function assertFunctionName(callee: TSESTree.Node, bindings: Bindings): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.named.get(callee.name);
  }
  return isMember(callee) && isAssertOwner(callee.object, bindings)
    ? callee.property.name
    : undefined;
}

function expectFloat(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  if (!(isMember(callee) && MATCHERS.has(callee.property.name))) {
    return undefined;
  }
  const modifiers = expectModifiers(callee);
  if (modifiers === undefined) {
    return undefined;
  }
  const deep =
    MATCHERS.get(callee.property.name) === true ||
    modifiers.some((link) => link.property.name === 'deep');
  return firstFloat(node.arguments.slice(0, 1), deep);
}

function isAssertCall(callee: TSESTree.Node, bindings: Bindings): boolean {
  return callee.type === AST_NODE_TYPES.Identifier && isAssertOwner(callee, bindings);
}

function truthFloat(node: TSESTree.CallExpression, bindings: Bindings): TSESTree.Node | undefined {
  const [first] = node.arguments;
  if (first === undefined || first.type === AST_NODE_TYPES.SpreadElement) {
    return undefined;
  }
  const truthCall =
    isExpectCall(node) ||
    isAssertCall(node.callee, bindings) ||
    TRUTH_FUNCTIONS.has(assertFunctionName(node.callee, bindings) ?? '');
  return truthCall ? comparedFloat(first) : undefined;
}

function assertFloat(node: TSESTree.CallExpression, bindings: Bindings): TSESTree.Node | undefined {
  const name = assertFunctionName(node.callee, bindings);
  const deep = name === undefined ? undefined : ASSERT_FUNCTIONS.get(name);
  return deep === undefined
    ? truthFloat(node, bindings)
    : firstFloat(node.arguments.slice(0, 2), deep);
}

export const rule: TSESLint.RuleModule<'floatEquality'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Ban exact equality assertions against a non-integral float literal' },
    schema: [],
    messages: {
      floatEquality:
        'A float literal compared for exact equality fails on rounding error. Use `toBeCloseTo(0.1)`, `expect.closeTo(0.1)` inside the expected value, chai `closeTo`, or `assert.ok(Math.abs(actual - 0.1) < tolerance)`. An exception fits only when the value is exact by construction.',
    },
  },
  create(context) {
    const bindings = moduleBindings(context.sourceCode.ast, ASSERT_MODULES);
    return {
      CallExpression(node) {
        const literal = expectFloat(node) ?? assertFloat(node, bindings);
        if (literal !== undefined) {
          context.report({ node: literal, messageId: 'floatEquality' });
        }
      },
    };
  },
};
