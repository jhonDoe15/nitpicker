import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { escapeText, unwrap } from '../support/flow/guard-forms.mts';

type MessageId = 'overflowingShift' | 'unboundedPower';
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;
type Growth = { readonly exponent: TSESTree.Node; readonly shift: boolean };

const RETRY_NAME = /attempt|retr(?:y|ies)|tries|backoff|failure/iu;
const TIMER_CALL = /^(?:setTimeout|sleep|delay|wait|waitFor|timeout)$/iu;

function isNumber(node: TSESTree.Node, value: number): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === value;
}

function growthOf(node: TSESTree.Node): Growth | undefined {
  const value = unwrap(node);
  if (
    value.type === AST_NODE_TYPES.BinaryExpression &&
    !isNumber(value.right, 0) &&
    value.right.type !== AST_NODE_TYPES.Literal
  ) {
    if (value.operator === '**' && isNumber(value.left, 2)) {
      return { exponent: value.right, shift: false };
    }
    if (value.operator === '<<' && isNumber(value.left, 1)) {
      return { exponent: value.right, shift: true };
    }
  }
  if (
    value.type === AST_NODE_TYPES.CallExpression &&
    value.callee.type === AST_NODE_TYPES.MemberExpression &&
    value.callee.object.type === AST_NODE_TYPES.Identifier &&
    value.callee.object.name === 'Math' &&
    value.callee.property.type === AST_NODE_TYPES.Identifier &&
    value.callee.property.name === 'pow' &&
    value.arguments.length === 2 &&
    value.arguments[0] !== undefined &&
    isNumber(value.arguments[0], 2) &&
    value.arguments[1] !== undefined &&
    value.arguments[1].type !== AST_NODE_TYPES.Literal &&
    value.arguments[1].type !== AST_NODE_TYPES.SpreadElement
  ) {
    return { exponent: value.arguments[1], shift: false };
  }
  return undefined;
}

function coreOf(node: TSESTree.Node): TSESTree.Node {
  const value = unwrap(node);
  return value.type === AST_NODE_TYPES.BinaryExpression &&
    (value.operator === '-' || value.operator === '+') &&
    value.right.type === AST_NODE_TYPES.Literal
    ? coreOf(value.left)
    : value;
}

function nameOf(node: TSESTree.Node): string | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name;
  }
  return node.type === AST_NODE_TYPES.MemberExpression &&
    node.property.type === AST_NODE_TYPES.Identifier
    ? node.property.name
    : undefined;
}

function enclosing(node: TSESTree.Node): TSESTree.Node {
  let current: TSESTree.Node = node;
  while (current.parent !== undefined && current.parent.type !== AST_NODE_TYPES.Program) {
    current = current.parent;
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      break;
    }
  }
  return current;
}

function isBounded(context: Context, node: TSESTree.Node, exponent: TSESTree.Node): boolean {
  const text = context.sourceCode.getText(enclosing(node));
  const name = escapeText(context.sourceCode.getText(coreOf(exponent)));
  const forms = [
    `Math\\.min\\(\\s*${name}\\s*,`,
    `Math\\.min\\([^,)]*,\\s*${name}\\s*\\)`,
    `\\b${name}\\s*[<>]=?(?![<>])`,
    `(?<![<>])[<>]=?\\s*${name}\\b`,
  ];
  return new RegExp(forms.join('|'), 'u').test(text);
}

function isTimerArgument(node: TSESTree.Node): boolean {
  let current = node;
  while (current.parent !== undefined && current.parent.type !== AST_NODE_TYPES.Program) {
    const { parent } = current;
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.arguments.includes(current as TSESTree.CallExpressionArgument)
    ) {
      const callee = nameOf(parent.callee);
      return callee !== undefined && TIMER_CALL.test(callee);
    }
    if (
      parent.type !== AST_NODE_TYPES.BinaryExpression &&
      parent.type !== AST_NODE_TYPES.TSAsExpression &&
      parent.type !== AST_NODE_TYPES.TemplateLiteral
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

function clamped(context: Context, product: TSESTree.Node): boolean {
  let current: TSESTree.Node = product;
  while (current.type !== AST_NODE_TYPES.Program) {
    const parent = current.parent;
    if (parent === undefined || parent === null) {
      return false;
    }
    if (
      parent.type === AST_NODE_TYPES.CallExpression &&
      parent.callee.type === AST_NODE_TYPES.MemberExpression &&
      parent.callee.object.type === AST_NODE_TYPES.Identifier &&
      parent.callee.object.name === 'Math' &&
      parent.callee.property.type === AST_NODE_TYPES.Identifier &&
      parent.callee.property.name === 'min'
    ) {
      return true;
    }
    if (
      parent.type === AST_NODE_TYPES.VariableDeclarator &&
      parent.id.type === AST_NODE_TYPES.Identifier
    ) {
      const text = context.sourceCode.getText(enclosing(parent));
      return new RegExp(`Math\\.min\\([^)]*\\b${escapeText(parent.id.name)}\\b`, 'u').test(text);
    }
    if (
      parent.type !== AST_NODE_TYPES.BinaryExpression &&
      parent.type !== AST_NODE_TYPES.TSAsExpression
    ) {
      return false;
    }
    current = parent;
  }
  return false;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not compute an exponential backoff delay that overflows for large attempt counts',
    },
    schema: [],
    messages: {
      overflowingShift:
        '`1 << {{exponent}}` wraps around at 32 bits, so the delay turns negative or ' +
        'small for a large `{{exponent}}`; cap the exponent (`Math.min({{exponent}}, ' +
        '10)`) before the shift, or use `2 ** {{exponent}}` and clamp the delay with ' +
        '`Math.min`.',
      unboundedPower:
        '`2 ** {{exponent}}` grows without limit, so the delay reaches `Infinity` ' +
        'and `setTimeout` treats a delay above 2147483647 ms as 1 ms (retries then ' +
        'spin); clamp it with `Math.min(delay, maxDelay)`, or cap `{{exponent}}` ' +
        'first.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== '*') {
          return;
        }
        const growth = growthOf(node.left) ?? growthOf(node.right);
        if (growth === undefined || isBounded(context, node, growth.exponent)) {
          return;
        }
        const retry = RETRY_NAME.test(nameOf(coreOf(growth.exponent)) ?? '');
        if ((!retry && !isTimerArgument(node)) || (!growth.shift && clamped(context, node))) {
          return;
        }
        context.report({
          node,
          messageId: growth.shift ? 'overflowingShift' : 'unboundedPower',
          data: { exponent: context.sourceCode.getText(growth.exponent) },
        });
      },
    };
  },
};
