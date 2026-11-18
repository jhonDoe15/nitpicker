import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { NULLISH_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

type Context = Readonly<TSESLint.RuleContext<'decoded', []>>;

const DECODERS = new Set(['decodeURIComponent', 'decodeURI']);
const CONTAINER_MEMBERS = new Set(['query', 'searchParams']);
const CONTAINER_NAMES = new Set(['searchParams', 'query', 'queryParams']);
const READ_METHODS = new Set(['get', 'getAll']);
const REQUEST_READS = new Set(['query', 'param']);
const REQUEST_NAMES = new Set(['req', 'request']);
const STRING_METHODS = new Set(['trim', 'toString']);
const MAX_DEPTH = 6;

function calleeName(node: TSESTree.CallExpression): string | undefined {
  return node.callee.type === AST_NODE_TYPES.Identifier ? node.callee.name : undefined;
}

function methodOf(node: TSESTree.CallExpression): [TSESTree.Node, string] | undefined {
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed
    ? [callee.object, nameOf(callee.property) ?? '']
    : undefined;
}

function isRequest(node: TSESTree.Node): boolean {
  const value = unwrapOf(node, NULLISH_WRAPPERS);
  if (value.type === AST_NODE_TYPES.Identifier) {
    return REQUEST_NAMES.has(value.name);
  }
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    nameOf(value.property) === 'req'
  );
}

function definitionOf(context: Context, node: TSESTree.Identifier) {
  const [definition] = findVariable(context, node, node.name)?.defs ?? [];
  return definition;
}

function isContainerMember(node: TSESTree.MemberExpression): boolean {
  const property = node.computed ? '' : (nameOf(node.property) ?? '');
  return (
    CONTAINER_MEMBERS.has(property) ||
    (property === 'params' &&
      node.object.type === AST_NODE_TYPES.Identifier &&
      isRequest(node.object))
  );
}

function isContainerCall(node: TSESTree.CallExpression): boolean {
  const method = methodOf(node);
  return (
    calleeName(node) === 'useSearchParams' ||
    (method !== undefined &&
      node.arguments.length === 0 &&
      method[1] === 'query' &&
      isRequest(method[0]))
  );
}

function isContainerBinding(context: Context, node: TSESTree.Identifier, depth: number): boolean {
  const definition = definitionOf(context, node);
  if (definition?.type === TSESLint.Scope.DefinitionType.Parameter) {
    return CONTAINER_NAMES.has(node.name);
  }
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return false;
  }
  const { id, init } = definition.node;
  if (init === null || init === undefined) {
    return false;
  }
  if (id.type === AST_NODE_TYPES.ArrayPattern) {
    const first = id.elements[0];
    return (
      first?.type === AST_NODE_TYPES.Identifier &&
      first.name === node.name &&
      isContainer(context, init, depth + 1)
    );
  }
  return id.type === AST_NODE_TYPES.Identifier && isContainer(context, init, depth + 1);
}

function isContainer(context: Context, node: TSESTree.Node, depth: number): boolean {
  const value = unwrapOf(node, NULLISH_WRAPPERS);
  if (depth > MAX_DEPTH) {
    return false;
  }
  switch (value.type) {
    case AST_NODE_TYPES.NewExpression:
      return (
        value.callee.type === AST_NODE_TYPES.Identifier && value.callee.name === 'URLSearchParams'
      );
    case AST_NODE_TYPES.CallExpression:
      return isContainerCall(value);
    case AST_NODE_TYPES.MemberExpression:
      return isContainerMember(value);
    case AST_NODE_TYPES.Identifier:
      return isContainerBinding(context, value, depth);
    default:
      return false;
  }
}

function isDecodedCall(context: Context, node: TSESTree.CallExpression, depth: number): boolean {
  const method = methodOf(node);
  if (calleeName(node) === 'String') {
    const [argument] = node.arguments;
    return argument !== undefined && isDecoded(context, argument, depth + 1);
  }
  if (method === undefined) {
    return false;
  }
  const [owner, name] = method;
  if (READ_METHODS.has(name)) {
    return isContainer(context, owner, depth + 1);
  }
  if (REQUEST_READS.has(name) && node.arguments.length > 0) {
    return isRequest(owner);
  }
  return STRING_METHODS.has(name) && isDecoded(context, owner, depth + 1);
}

function isDecodedBinding(context: Context, node: TSESTree.Identifier, depth: number): boolean {
  const definition = definitionOf(context, node);
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return false;
  }
  const { id, init } = definition.node;
  if (init === null || init === undefined) {
    return false;
  }
  return id.type === AST_NODE_TYPES.ObjectPattern
    ? isContainer(context, init, depth + 1)
    : id.type === AST_NODE_TYPES.Identifier && isDecoded(context, init, depth + 1);
}

function isDecoded(context: Context, node: TSESTree.Node, depth: number): boolean {
  const value = unwrapOf(node, NULLISH_WRAPPERS);
  if (depth > MAX_DEPTH) {
    return false;
  }
  switch (value.type) {
    case AST_NODE_TYPES.MemberExpression:
      return (
        isContainer(context, value.object, depth + 1) ||
        (value.computed && isDecoded(context, value.object, depth + 1))
      );
    case AST_NODE_TYPES.CallExpression:
      return isDecodedCall(context, value, depth);
    case AST_NODE_TYPES.Identifier:
      return isDecodedBinding(context, value, depth);
    case AST_NODE_TYPES.LogicalExpression:
      return isDecoded(context, value.left, depth + 1);
    default:
      return false;
  }
}

export const rule: TSESLint.RuleModule<'decoded'> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Report decodeURIComponent applied to a query or route value that is already decoded',
    },
    schema: [],
    messages: {
      decoded:
        'This value is already percent-decoded by the framework. Decoding it again changes ' +
        'text with a literal `%41` and throws a URIError on a bare `%`. Use the value as it ' +
        'is; decode only raw text such as `location.search` or `request.url`.',
    },
  },
  create(context) {
    return {
      CallExpression(node: TSESTree.CallExpression) {
        const [argument] = node.arguments;
        if (
          node.arguments.length === 1 &&
          node.callee.type === AST_NODE_TYPES.Identifier &&
          DECODERS.has(node.callee.name) &&
          argument !== undefined &&
          isDecoded(context, argument, 0)
        ) {
          context.report({ node, messageId: 'decoded' });
        }
      },
    };
  },
};
