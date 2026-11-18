import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';

type MessageId = 'uncheckedJson';

const BODY_READERS = new Set(['json', 'text', 'blob', 'arrayBuffer', 'formData', 'clone', 'body']);
const FETCH_OWNERS = new Set(['globalThis', 'window', 'self']);

function isFetchCall(node: TSESTree.Node | null | undefined): boolean {
  if (node?.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'fetch';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    FETCH_OWNERS.has(callee.object.name) &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === 'fetch'
  );
}

function unwrapAwait(node: TSESTree.Node | null | undefined): TSESTree.Node | null | undefined {
  return node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
}

function isThenCallbackOfFetch(param: TSESTree.Identifier): boolean {
  const callback = param.parent;
  const call = callback.parent;
  return (
    (callback.type === AST_NODE_TYPES.ArrowFunctionExpression ||
      callback.type === AST_NODE_TYPES.FunctionExpression) &&
    callback.params[0] === param &&
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === callback &&
    call.callee.type === AST_NODE_TYPES.MemberExpression &&
    call.callee.property.type === AST_NODE_TYPES.Identifier &&
    call.callee.property.name === 'then' &&
    isFetchCall(call.callee.object)
  );
}

function isResponseOrigin(definition: TSESLint.Scope.Definition): boolean {
  const { node, name } = definition;
  if (definition.type === 'Variable' && node.type === AST_NODE_TYPES.VariableDeclarator) {
    return node.id === name && isFetchCall(unwrapAwait(node.init));
  }
  return (
    definition.type === 'Parameter' &&
    name.type === AST_NODE_TYPES.Identifier &&
    isThenCallbackOfFetch(name)
  );
}

function isInTryWithCatch(node: TSESTree.Node): boolean {
  let child = node;
  let parent: TSESTree.Node | undefined = node.parent;
  for (
    ;
    parent !== undefined && parent.type !== AST_NODE_TYPES.Program;
    child = parent, parent = parent.parent
  ) {
    if (
      parent.type === AST_NODE_TYPES.TryStatement &&
      parent.block === child &&
      parent.handler !== null
    ) {
      return true;
    }
    if (
      parent.type === AST_NODE_TYPES.FunctionDeclaration ||
      parent.type === AST_NODE_TYPES.FunctionExpression ||
      parent.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return false;
    }
  }
  return false;
}

function isCaught(call: TSESTree.CallExpression): boolean {
  const outer = call.parent;
  return (
    outer.type === AST_NODE_TYPES.MemberExpression &&
    outer.object === call &&
    outer.property.type === AST_NODE_TYPES.Identifier &&
    outer.property.name === 'catch'
  );
}

function readerName(member: TSESTree.MemberExpression): string | undefined {
  return member.property.type === AST_NODE_TYPES.Identifier && !member.computed
    ? member.property.name
    : undefined;
}

function isPlainBodyUse(reference: TSESLint.Scope.Reference): boolean {
  const { parent } = reference.identifier;
  return (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.object === reference.identifier &&
    BODY_READERS.has(readerName(parent) ?? '')
  );
}

function isJsonRead(
  node: TSESTree.CallExpression,
): TSESTree.Identifier | TSESTree.AwaitExpression | undefined {
  const { callee } = node;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    readerName(callee) !== 'json' ||
    node.arguments.length > 0
  ) {
    return undefined;
  }
  const { object } = callee;
  if (object.type === AST_NODE_TYPES.Identifier) {
    return object;
  }
  return object.type === AST_NODE_TYPES.AwaitExpression && isFetchCall(object.argument)
    ? object
    : undefined;
}

export const rule: TSESLint.RuleModule<MessageId, []> = {
  meta: {
    type: 'problem',
    docs: { description: 'Check the status of a fetch response before reading its body as JSON' },
    schema: [],
    messages: {
      uncheckedJson:
        '`{{name}}.json()` runs before `{{name}}.ok` or the status is checked, so an HTML ' +
        'error page from a proxy fails as an opaque `SyntaxError` and the status is lost; ' +
        'check `{{name}}.ok` first, or read `{{name}}.text()` and parse it inside `try`.',
    },
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const target = isJsonRead(node);
        if (target === undefined || isCaught(node) || isInTryWithCatch(node)) {
          return;
        }
        if (target.type === AST_NODE_TYPES.AwaitExpression) {
          context.report({ node, messageId: 'uncheckedJson', data: { name: 'response' } });
          return;
        }
        const variable = sourceCode
          .getScope(node)
          .references.find(({ identifier }) => identifier === target)?.resolved;
        if (variable === undefined || variable === null || !variable.defs.some(isResponseOrigin)) {
          return;
        }
        const checkedBefore = variable.references.some(
          (reference) =>
            reference.isRead() &&
            reference.identifier !== target &&
            reference.identifier.range[0] < node.range[0] &&
            !isPlainBodyUse(reference),
        );
        if (!checkedBefore) {
          context.report({ node, messageId: 'uncheckedJson', data: { name: target.name } });
        }
      },
    };
  },
};
