import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { hasArrayType, hasListType } from '../../support/checked-types.mts';

type MessageId = 'spread';
type Docs = { readonly requiresTypeChecking: boolean };
type Context = Readonly<TSESLint.RuleContext<MessageId, []>>;

const { DefinitionType } = TSESLint.Scope;

function isRestParameter(context: Context, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  if (node.name === 'arguments') {
    return true;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  return (
    definition?.type === DefinitionType.Parameter &&
    definition.name.parent.type === AST_NODE_TYPES.RestElement
  );
}

const LIST_METHODS = new Set(['push', 'unshift', 'splice']);
const VARIADIC_FUNCTIONS = new Set([
  'Math.max',
  'Math.min',
  'String.fromCharCode',
  'String.fromCodePoint',
]);

function memberName(context: Context, callee: TSESTree.MemberExpression): string | undefined {
  const { object, property } = callee;
  if (callee.computed || property.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }
  if (object.type !== AST_NODE_TYPES.Identifier) {
    return `.${property.name}`;
  }
  const local = (findVariable(context, object, object.name)?.defs.length ?? 0) > 0;
  return local ? `.${property.name}` : `${object.name}.${property.name}`;
}

function isListSink(context: Context, callee: TSESTree.Node): boolean {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.object.type === AST_NODE_TYPES.Super
  ) {
    return false;
  }
  const name = memberName(context, callee);
  if (name === undefined) {
    return false;
  }
  if (VARIADIC_FUNCTIONS.has(name)) {
    return true;
  }
  const method = name.slice(name.lastIndexOf('.') + 1);
  return LIST_METHODS.has(method) && hasArrayType(context, callee.object) !== 'no';
}

function isSinkArgument(context: Context, node: TSESTree.SpreadElement): boolean {
  const { parent } = node;
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.some((argument) => argument === node) &&
    isListSink(context, parent.callee)
  );
}

function isShortLiteral(value: TSESTree.Expression): boolean {
  const { type } = value;
  if (type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      value.consequent.type === AST_NODE_TYPES.ArrayExpression &&
      value.alternate.type === AST_NODE_TYPES.ArrayExpression
    );
  }
  return (
    type === AST_NODE_TYPES.ArrayExpression ||
    type === AST_NODE_TYPES.Literal ||
    type === AST_NODE_TYPES.TemplateLiteral
  );
}

function mayBeLong(context: Context, value: TSESTree.Expression): boolean {
  if (isShortLiteral(value) || isRestParameter(context, value)) {
    return false;
  }
  return hasListType(context, value) !== 'no';
}

export const rule: TSESLint.RuleModule<MessageId, [], Docs> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not spread a list of unknown length into push, unshift, splice, Math.max, Math.min or String.fromCharCode',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      spread:
        'Spreading a list into `push`, `unshift`, `splice`, `Math.max`, `Math.min` or `String.fromCharCode` passes each item as an argument, and the call throws `RangeError: Maximum call stack size exceeded` once the list reaches about 125,000 items. Append with a loop (`for (const item of items) target.push(item)`), use `concat`, or compare item by item for a largest or smallest value. An exception fits only when the list is always short.',
    },
  },
  create(context) {
    return {
      SpreadElement(node) {
        if (isSinkArgument(context, node) && mayBeLong(context, node.argument)) {
          context.report({ node, messageId: 'spread' });
        }
      },
    };
  },
};
