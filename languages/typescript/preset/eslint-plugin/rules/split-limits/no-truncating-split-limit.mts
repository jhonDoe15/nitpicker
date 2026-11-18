import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../typed/syntax-views.mts';
import { nameOf } from '../typed/node-views.mts';

type Context = Readonly<TSESLint.RuleContext<'truncated', []>>;

const MIN_LIMIT = 2;

const CAPTURE_GROUP = /(?<!\\)\((?!\?)/u;

function capturesParts(separator: TSESTree.Node | undefined): boolean {
  return (
    separator?.type === AST_NODE_TYPES.Literal &&
    'regex' in separator &&
    CAPTURE_GROUP.test(separator.regex.pattern)
  );
}

function limitOf(node: TSESTree.CallExpression): number | undefined {
  const { callee, arguments: args } = node;
  const [separator, limit] = args;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    nameOf(callee.property) !== 'split' ||
    args.length !== 2 ||
    capturesParts(separator) ||
    limit?.type !== AST_NODE_TYPES.Literal ||
    typeof limit.value !== 'number' ||
    !Number.isInteger(limit.value)
  ) {
    return undefined;
  }
  return limit.value >= MIN_LIMIT ? limit.value : undefined;
}

function readsLast(node: TSESTree.Node, limit: number): boolean {
  const user: TSESTree.Node | undefined = node.parent;
  if (user === undefined) {
    return false;
  }
  if (user.type === AST_NODE_TYPES.MemberExpression && user.object === node) {
    if (user.computed) {
      return user.property.type === AST_NODE_TYPES.Literal && user.property.value === limit - 1;
    }
    return nameOf(user.property) === 'pop' || nameOf(user.property) === 'at'
      ? readsLastCall(user, limit)
      : false;
  }
  return user.type === AST_NODE_TYPES.VariableDeclarator && user.init === node
    ? destructuresLast(user.id, limit)
    : false;
}

function readsLastCall(member: TSESTree.MemberExpression, limit: number): boolean {
  const call = member.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || call.callee !== member) {
    return false;
  }
  if (nameOf(member.property) === 'pop') {
    return call.arguments.length === 0;
  }
  const [index] = call.arguments;
  return (
    index?.type === AST_NODE_TYPES.UnaryExpression &&
    index.operator === '-' &&
    index.argument.type === AST_NODE_TYPES.Literal &&
    index.argument.value === 1 &&
    limit >= MIN_LIMIT
  );
}

function destructuresLast(pattern: TSESTree.Node, limit: number): boolean {
  return (
    pattern.type === AST_NODE_TYPES.ArrayPattern &&
    pattern.elements.length === limit &&
    pattern.elements.every(
      (element) => element !== null && element.type !== AST_NODE_TYPES.RestElement,
    )
  );
}

function bindingOf(node: TSESTree.Node): TSESTree.Node | undefined {
  const value = unwrapOf(node, ASSERTION_FORMS);
  const holder: TSESTree.Node | undefined = value.parent;
  return holder?.type === AST_NODE_TYPES.VariableDeclarator && holder.init === node
    ? holder.id
    : undefined;
}

function variableReads(context: SourceContext, id: TSESTree.Identifier, limit: number): boolean {
  const references = findVariable(context, id, id.name)?.references ?? [];
  return references.some(({ identifier, init }) => !init && readsLast(identifier, limit));
}

function usesLastPart(
  context: SourceContext,
  node: TSESTree.CallExpression,
  limit: number,
): boolean {
  const outer = unwrapOf(node, ASSERTION_FORMS);
  if (readsLast(outer, limit)) {
    return true;
  }
  const binding = bindingOf(outer);
  if (binding === undefined) {
    return false;
  }
  return binding.type === AST_NODE_TYPES.Identifier && variableReads(context, binding, limit);
}

export const rule: TSESLint.RuleModule<'truncated'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report split(separator, limit) whose last part is read, ' +
        'because the rest of the text is dropped',
    },
    schema: [],
    messages: {
      truncated:
        'JavaScript `split(separator, limit)` drops the text after the last part, so a value that ' +
        'contains the separator is cut short. Split once at `indexOf(separator)` and `slice` ' +
        'both sides, or use `const [head, ...rest] = text.split(separator)` and `rest.join(separator)`.',
    },
  },
  create(context: Context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const limit = limitOf(node);
        if (limit !== undefined && usesLastPart(context, node, limit)) {
          context.report({ node, messageId: 'truncated' });
        }
      },
    };
  },
};
