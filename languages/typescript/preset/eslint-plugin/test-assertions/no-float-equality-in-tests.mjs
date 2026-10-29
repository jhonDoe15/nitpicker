import { chainOf } from '../rules/analysis/ancestry.mjs';
import { moduleBindings } from '../rules/analysis/test-code-analysis.mjs';

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
const ASSERT_MODULES = new Set([
  'assert',
  'node:assert',
  'assert/strict',
  'node:assert/strict',
  'chai',
  'vitest',
]);
const ASSERT_ALIASES = new Set(['assert', 'strict']);
const EXPECT_VARIANTS = new Set(['soft', 'poll']);
const MODIFIERS = new Set(['not', 'resolves', 'rejects', 'to', 'be', 'been', 'is', 'deep']);
const TYPE_WRAPPERS = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
]);

function unwrap(node) {
  return chainOf(node, (current) =>
    TYPE_WRAPPERS.has(current.type) ? current.expression : undefined,
  ).at(-1);
}

function isNonIntegral(node) {
  const literal = unwrap(node);
  const operand =
    literal.type === 'UnaryExpression' && literal.operator === '-'
      ? unwrap(literal.argument)
      : literal;
  return (
    operand.type === 'Literal' &&
    typeof operand.value === 'number' &&
    Number.isFinite(operand.value) &&
    !Number.isInteger(operand.value)
  );
}

function nestedValues(node) {
  if (node.type === 'ArrayExpression') {
    return node.elements.filter((element) => element !== null && element.type !== 'SpreadElement');
  }
  if (node.type === 'ObjectExpression') {
    return node.properties.filter((property) => property.type === 'Property').map((p) => p.value);
  }
  return [];
}

function firstFloat(candidates, deep) {
  const pending = [...candidates];
  for (const node of pending) {
    if (isNonIntegral(node)) {
      return node;
    }
    if (deep) {
      pending.push(...nestedValues(unwrap(node)));
    }
  }
  return undefined;
}

function isNamed(node, name) {
  return node.type === 'Identifier' && node.name === name;
}

function isMember(node) {
  return node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier';
}

function isExpectCall(node) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (isNamed(callee, 'expect')) {
    return true;
  }
  return (
    isMember(callee) &&
    ((isNamed(callee.object, 'expect') && EXPECT_VARIANTS.has(callee.property.name)) ||
      callee.property.name === 'expect')
  );
}

function isModifierLink(node) {
  return isMember(node) && MODIFIERS.has(node.property.name);
}

function expectModifiers(callee) {
  const links = chainOf(callee.object, (current) =>
    isModifierLink(current) ? current.object : undefined,
  );
  return isExpectCall(links.at(-1)) ? links.filter(isModifierLink) : undefined;
}

function isStrictLink(node) {
  return isMember(node) && node.property.name === 'strict';
}

function isAssertOwner(node, bindings) {
  const base = chainOf(node, (current) => (isStrictLink(current) ? current.object : undefined)).at(
    -1,
  );
  if (base.type === 'Identifier') {
    return (
      base.name === 'assert' ||
      bindings.namespaces.has(base.name) ||
      ASSERT_ALIASES.has(bindings.named.get(base.name))
    );
  }
  return isMember(base) && base.property.name === 'assert';
}

function assertFunctionName(callee, bindings) {
  if (callee.type === 'Identifier') {
    return bindings.named.get(callee.name);
  }
  return isMember(callee) && isAssertOwner(callee.object, bindings)
    ? callee.property.name
    : undefined;
}

function expectFloat(node) {
  const { callee } = node;
  if (!isMember(callee) || !MATCHERS.has(callee.property.name)) {
    return undefined;
  }
  const modifiers = expectModifiers(callee);
  if (modifiers === undefined) {
    return undefined;
  }
  const deep =
    MATCHERS.get(callee.property.name) || modifiers.some((link) => link.property.name === 'deep');
  return firstFloat(node.arguments.slice(0, 1), deep);
}

function assertFloat(node, bindings) {
  const name = assertFunctionName(node.callee, bindings);
  return ASSERT_FUNCTIONS.has(name)
    ? firstFloat(node.arguments.slice(0, 2), ASSERT_FUNCTIONS.get(name))
    : undefined;
}

export const rule = {
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
