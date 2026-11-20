import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { isLiteral } from '../typed/syntax-views.mts';
import {
  escapeText as escapeRegExp,
  soleInitializer,
  unwrap,
} from '../support/flow/guard-forms.mts';

type MessageId = 'nanOnly';

const NUMBER = 'Number';

const PARSER_NAMES = new Set([NUMBER, 'parseFloat']);
const GUARD_PARENTS = new Set<string>([
  AST_NODE_TYPES.IfStatement,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.ReturnStatement,
  AST_NODE_TYPES.WhileStatement,
  AST_NODE_TYPES.VariableDeclarator,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);
const FINITE_CHECK = /isFinite|Infinity|parseInt|Math\.(?:min|max)\(|Number\.is(?:Safe)?Integer/u;

function nanArgument(node: TSESTree.CallExpression): TSESTree.Node | undefined {
  const { callee } = node;
  const global = callee.type === AST_NODE_TYPES.Identifier && callee.name === 'isNaN';
  const member =
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === NUMBER &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'isNaN';
  const [argument] = node.arguments;
  return (global || member) && node.arguments.length === 1 && argument !== undefined
    ? argument
    : undefined;
}

function isDateCast(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression &&
    node.typeAnnotation.type === AST_NODE_TYPES.TSTypeReference &&
    node.typeAnnotation.typeName.type === AST_NODE_TYPES.Identifier &&
    node.typeAnnotation.typeName.name === 'Date'
  );
}

function probeInner(value: TSESTree.Node): TSESTree.Node | undefined {
  if (value.type === AST_NODE_TYPES.UnaryExpression && value.operator === '+') {
    return value.argument;
  }
  return value.type === AST_NODE_TYPES.CallExpression && value.arguments.length === 1
    ? value.arguments[0]
    : value;
}

function probedName(node: TSESTree.Node): string | undefined {
  const value = unwrap(node);
  const inner = probeInner(value);
  return inner?.type === AST_NODE_TYPES.Identifier ? inner.name : undefined;
}

function isFilterProbe(node: TSESTree.Node): boolean {
  const name = probedName(node);
  const callback = enclosingFunction(node);
  const call = callback.parent;
  return (
    name !== undefined &&
    callback.type === AST_NODE_TYPES.ArrowFunctionExpression &&
    callback.params[0]?.type === AST_NODE_TYPES.Identifier &&
    callback.params[0].name === name &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === callback &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    call.callee.property.type === AST_NODE_TYPES.Identifier &&
    call.callee.property.name === 'filter'
  );
}

function isParse(node: TSESTree.CallExpression): boolean {
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return PARSER_NAMES.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === NUMBER &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'parseFloat'
  );
}

function canBeInfinite(node: TSESTree.Node): boolean {
  const value = unwrap(node);
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return isParse(value);
  }
  if (value.type === AST_NODE_TYPES.UnaryExpression) {
    return value.operator === '+' && !isLiteral(value.argument) && !isDateCast(value.argument);
  }
  if (value.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  if (value.operator === '/') {
    return !isNonZeroLiteral(value.right);
  }
  return (
    (value.operator === '*' || value.operator === '**') &&
    !isLiteral(value.left) &&
    !isLiteral(value.right)
  );
}

function isNonZeroLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'number' && node.value !== 0;
}

function isGuardPosition(node: TSESTree.Node): boolean {
  const chain = [node];
  for (const current of chain) {
    const above = current.parent;
    if (
      above !== undefined &&
      ((above.type === AST_NODE_TYPES.UnaryExpression && above.operator === '!') ||
        above.type === AST_NODE_TYPES.LogicalExpression)
    ) {
      chain.push(above);
    }
  }
  const top = chain.at(-1) ?? node;
  const { parent } = top;
  if (parent === undefined || !GUARD_PARENTS.has(parent.type)) {
    return false;
  }
  return !(
    (parent.type === AST_NODE_TYPES.IfStatement ||
      parent.type === AST_NODE_TYPES.ConditionalExpression ||
      parent.type === AST_NODE_TYPES.WhileStatement) &&
    parent.test !== top
  );
}

function enclosingFunction(node: TSESTree.Node): TSESTree.Node {
  const pending: TSESTree.Node[] = [node];
  for (const current of pending) {
    if (current.type === AST_NODE_TYPES.Program) {
      return current;
    }
    const { parent } = current;
    if (
      parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return parent;
    }
    pending.push(parent);
  }
  return node;
}

function isBounded(text: string, name: string): boolean {
  const escaped = escapeRegExp(name);
  return new RegExp(`\\b${escaped}\\b\\s*[<>]|[<>]=?\\s*${escaped}\\b`, 'u').test(text);
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: { description: 'Check a parsed or computed number with isFinite, not only isNaN' },
    schema: [],
    messages: {
      nanOnly:
        '`isNaN` lets `Infinity` and `-Infinity` through (`Number("1e309")`, `x / 0` ' +
        'and `Number("Infinity")` all pass it), so the value goes on as a limit, an ' +
        'amount or `null` in JSON; check `Number.isFinite({{name}})` instead.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const argument = nanArgument(node);
        if (argument === undefined || !isGuardPosition(node)) {
          return;
        }
        const source =
          argument.type === AST_NODE_TYPES.Identifier
            ? soleInitializer(context, argument)
            : argument;
        if (source === undefined || !canBeInfinite(source) || isFilterProbe(argument)) {
          return;
        }
        const text = context.sourceCode.getText(enclosingFunction(node));
        const name = context.sourceCode.getText(argument);
        if (
          FINITE_CHECK.test(text) ||
          (argument.type === AST_NODE_TYPES.Identifier && isBounded(text, name))
        ) {
          return;
        }
        context.report({ node, messageId: 'nanOnly', data: { name } });
      },
    };
  },
};
