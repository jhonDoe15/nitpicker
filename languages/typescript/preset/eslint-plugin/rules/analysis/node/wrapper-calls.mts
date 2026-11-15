import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { depthFirst, isNode, objectChildren } from '../../typed/node-views.mts';
import {
  isFunctionNode,
  resolveConstant,
  resolveFunction,
  stringValue,
  type SourceContext,
} from '../constant-resolution.mts';
import {
  describeSubprocess,
  literalTokens,
  type ModuleBindings,
  type Subprocess,
} from '../subprocess-calls.mts';

type FunctionNode =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;
export type WrapperCall = {
  readonly inner: Subprocess;
  readonly node: TSESTree.CallExpression;
  readonly command: string | undefined;
  readonly tokens: string[];
};

function parameterNames(fn: FunctionNode): string[] {
  return fn.params.flatMap((parameter) => {
    if (parameter.type === AST_NODE_TYPES.Identifier) {
      return [parameter.name];
    }
    if (
      parameter.type === AST_NODE_TYPES.RestElement &&
      parameter.argument.type === AST_NODE_TYPES.Identifier
    ) {
      return [parameter.argument.name];
    }
    if (
      parameter.type === AST_NODE_TYPES.AssignmentPattern &&
      parameter.left.type === AST_NODE_TYPES.Identifier
    ) {
      return [parameter.left.name];
    }
    return [];
  });
}

function referencesAny(node: TSESTree.Node | undefined, names: ReadonlySet<string>): boolean {
  if (node === undefined) {
    return false;
  }
  for (const candidate of depthFirst<object>(node, objectChildren)) {
    if (
      isNode(candidate) &&
      candidate.type === AST_NODE_TYPES.Identifier &&
      names.has(candidate.name)
    ) {
      return true;
    }
  }
  return false;
}

function pushChildren(
  pending: TSESTree.Node[],
  visitorKeys: SourceContext['sourceCode']['visitorKeys'],
  node: TSESTree.Node,
): void {
  for (const key of visitorKeys[node.type] ?? []) {
    const value: unknown = Reflect.get(node, key);
    if (Array.isArray(value)) {
      pending.push(...value.filter(isNode));
    } else if (isNode(value)) {
      pending.push(value);
    }
  }
}

export function forEachNode(
  context: SourceContext,
  root: TSESTree.Node,
  visit: (node: TSESTree.Node) => void,
): void {
  const { visitorKeys } = context.sourceCode;
  const pending = [root];
  for (const node of pending) {
    visit(node);
    pushChildren(pending, visitorKeys, node);
  }
}

export function describeWrapperCall(
  context: SourceContext,
  call: TSESTree.Node,
  bindings: ModuleBindings,
): WrapperCall | undefined {
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const fn = resolveFunction(context, call.callee);
  if (!isFunctionNode(fn)) {
    return undefined;
  }
  const parameters = parameterNames(fn);
  const names = new Set(parameters);
  const found: WrapperCall[] = [];
  forEachNode(context, fn.body, (node) => {
    if (found.length > 0 || node.type !== AST_NODE_TYPES.CallExpression) {
      return;
    }
    const inner = describeSubprocess(context, node, bindings);
    if (!inner) {
      return;
    }
    const commandIndex =
      inner.commandNode?.type === AST_NODE_TYPES.Identifier
        ? parameters.indexOf(inner.commandNode.name)
        : -1;
    if (commandIndex >= 0) {
      const command = stringValue(resolveConstant(context, call.arguments[commandIndex]));
      const tokens = call.arguments
        .filter((_argument, index) => index !== commandIndex)
        .flatMap((argument) => literalTokens(context, argument));
      found.push({ inner, node, command, tokens });
      return;
    }
    if (inner.command !== undefined && referencesAny(inner.argsNode, names)) {
      const tokens = [
        ...inner.tokens,
        ...call.arguments.flatMap((argument) => literalTokens(context, argument)),
      ];
      found.push({ inner, node, command: inner.command, tokens });
    }
  });
  return found[0];
}
