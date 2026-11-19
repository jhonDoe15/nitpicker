import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable } from '../../analysis/constant-resolution.mts';
import { nameOf } from '../../typed/node-views.mts';
import { NULLISH_WRAPPERS, unwrapOf } from '../../typed/syntax-views.mts';

type Context = Readonly<TSESLint.RuleContext<'decoded', []>>;
type Step = { readonly done: boolean } | { readonly next: TSESTree.Node };

const DECODERS = new Set(['decodeURIComponent', 'decodeURI']);
const QUERY = 'query';
const CONTAINER_MEMBERS = new Set([QUERY, 'searchParams']);
const CONTAINER_NAMES = new Set(['searchParams', QUERY, 'queryParams']);
const READ_METHODS = new Set(['get', 'getAll']);
const REQUEST_READS = new Set([QUERY, 'param']);
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
      method[1] === QUERY &&
      isRequest(method[0]))
  );
}

type Binding = {
  readonly id: TSESTree.BindingName;
  readonly init: TSESTree.Expression;
};

function variableBinding(context: Context, node: TSESTree.Identifier): Binding | undefined {
  const definition = definitionOf(context, node);
  if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) {
    return undefined;
  }
  const { id, init } = definition.node;
  return init === null ? undefined : { id, init };
}

function containerBindingStep(context: Context, node: TSESTree.Identifier): Step {
  if (definitionOf(context, node)?.type === TSESLint.Scope.DefinitionType.Parameter) {
    return { done: CONTAINER_NAMES.has(node.name) };
  }
  const binding = variableBinding(context, node);
  if (binding === undefined) {
    return { done: false };
  }
  const { id, init } = binding;
  if (id.type === AST_NODE_TYPES.ArrayPattern) {
    const first = id.elements[0];
    return first?.type === AST_NODE_TYPES.Identifier && first.name === node.name
      ? { next: init }
      : { done: false };
  }
  return id.type === AST_NODE_TYPES.Identifier ? { next: init } : { done: false };
}

function containerStep(context: Context, value: TSESTree.Node): Step {
  if (value.type === AST_NODE_TYPES.NewExpression) {
    return {
      done:
        value.callee.type === AST_NODE_TYPES.Identifier && value.callee.name === 'URLSearchParams',
    };
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return { done: isContainerCall(value) };
  }
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return { done: isContainerMember(value) };
  }
  return value.type === AST_NODE_TYPES.Identifier
    ? containerBindingStep(context, value)
    : { done: false };
}

function isContainer(context: Context, node: TSESTree.Node, depth: number): boolean {
  const pending: TSESTree.Node[] = [node];
  for (const [offset, current] of pending.entries()) {
    if (depth + offset > MAX_DEPTH) {
      return false;
    }
    const step = containerStep(context, unwrapOf(current, NULLISH_WRAPPERS));
    if ('done' in step) {
      return step.done;
    }
    pending.push(step.next);
  }
  return false;
}

function callStep(context: Context, node: TSESTree.CallExpression, depth: number): Step {
  const method = methodOf(node);
  if (calleeName(node) === 'String') {
    const [argument] = node.arguments;
    return argument === undefined ? { done: false } : { next: argument };
  }
  if (method === undefined) {
    return { done: false };
  }
  const [owner, name] = method;
  if (READ_METHODS.has(name)) {
    return { done: isContainer(context, owner, depth + 1) };
  }
  if (REQUEST_READS.has(name) && node.arguments.length > 0) {
    return { done: isRequest(owner) };
  }
  return STRING_METHODS.has(name) ? { next: owner } : { done: false };
}

function bindingStep(context: Context, node: TSESTree.Identifier, depth: number): Step {
  const binding = variableBinding(context, node);
  if (binding === undefined) {
    return { done: false };
  }
  const { id, init } = binding;
  if (id.type === AST_NODE_TYPES.ObjectPattern) {
    return { done: isContainer(context, init, depth + 1) };
  }
  return id.type === AST_NODE_TYPES.Identifier ? { next: init } : { done: false };
}

function memberStep(context: Context, value: TSESTree.MemberExpression, depth: number): Step {
  if (isContainer(context, value.object, depth + 1)) {
    return { done: true };
  }
  return value.computed ? { next: value.object } : { done: false };
}

function decodedStep(context: Context, value: TSESTree.Node, depth: number): Step {
  if (value.type === AST_NODE_TYPES.MemberExpression) {
    return memberStep(context, value, depth);
  }
  if (value.type === AST_NODE_TYPES.CallExpression) {
    return callStep(context, value, depth);
  }
  if (value.type === AST_NODE_TYPES.Identifier) {
    return bindingStep(context, value, depth);
  }
  return value.type === AST_NODE_TYPES.LogicalExpression ? { next: value.left } : { done: false };
}

function isDecoded(context: Context, node: TSESTree.Node): boolean {
  const pending: TSESTree.Node[] = [node];
  for (const [depth, current] of pending.entries()) {
    if (depth > MAX_DEPTH) {
      return false;
    }
    const step = decodedStep(context, unwrapOf(current, NULLISH_WRAPPERS), depth);
    if ('done' in step) {
      return step.done;
    }
    pending.push(step.next);
  }
  return false;
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
          isDecoded(context, argument)
        ) {
          context.report({ node, messageId: 'decoded' });
        }
      },
    };
  },
};
