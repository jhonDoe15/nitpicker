import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, depthFirst, nameOf, nodeChildren } from '../../typed/node-views.mts';

type Callable =
  TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

export type FileFunction = {
  readonly key: string;
  readonly name: string;
  readonly node: Callable;
  readonly owner: string;
  readonly params: ReadonlySet<string>;
};

export type FileCalls = {
  readonly functions: ReadonlyMap<string, FileFunction>;
  readonly calls: ReadonlyMap<string, ReadonlySet<string>>;
};

export type MethodCall = { readonly receiver: string; readonly method: string };

const MODULE = '';
const MODULE_STATEMENTS = new Set<string>([
  AST_NODE_TYPES.Program,
  AST_NODE_TYPES.ExportNamedDeclaration,
]);

export function isModuleLevel(statement: TSESTree.Node): boolean {
  return MODULE_STATEMENTS.has(statement.type);
}

export function descendants(root: TSESTree.Node): TSESTree.Node[] {
  return [...depthFirst<TSESTree.Node>(root, nodeChildren)];
}

function isCallable(node: TSESTree.Node | null | undefined): node is Callable {
  return (
    node?.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionExpression ||
    node?.type === AST_NODE_TYPES.FunctionDeclaration
  );
}

function paramNames(fn: Callable): Set<string> {
  return new Set(
    fn.params.flatMap((param) => {
      const inner = param.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param;
      const name = nameOf(
        inner.type === AST_NODE_TYPES.TSParameterProperty ? inner.parameter : inner,
      );
      return name === undefined ? [] : [name];
    }),
  );
}

function entry(owner: string, name: string, node: Callable): FileFunction {
  return { key: `${owner}#${name}`, name, node, owner, params: paramNames(node) };
}

function className(body: TSESTree.ClassBody): string {
  const { parent } = body;
  return `${nameOf(parent.id) ?? 'class'}@${String(parent.range[0])}`;
}

function memberEntry(member: TSESTree.ClassElement, owner: string): FileFunction | undefined {
  const isMember =
    member.type === AST_NODE_TYPES.MethodDefinition ||
    member.type === AST_NODE_TYPES.PropertyDefinition;
  const name = isMember && !member.computed ? nameOf(member.key) : undefined;
  const value = isMember ? member.value : undefined;
  return name !== undefined && isCallable(value) ? entry(owner, name, value) : undefined;
}

function functionEntry(node: TSESTree.FunctionDeclaration): FileFunction | undefined {
  return node.id !== null && isModuleLevel(node.parent)
    ? entry(MODULE, node.id.name, node)
    : undefined;
}

function variableEntry(node: TSESTree.VariableDeclarator): FileFunction | undefined {
  return isModuleLevel(node.parent.parent) &&
    node.id.type === AST_NODE_TYPES.Identifier &&
    isCallable(node.init)
    ? entry(MODULE, node.id.name, node.init)
    : undefined;
}

function moduleEntry(node: TSESTree.Node): FileFunction | undefined {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return functionEntry(node);
  }
  return node.type === AST_NODE_TYPES.VariableDeclarator ? variableEntry(node) : undefined;
}

function functionsOf(program: TSESTree.Program): FileFunction[] {
  return descendants(program).flatMap((node) => {
    if (node.type === AST_NODE_TYPES.ClassBody) {
      const owner = className(node);
      return node.body.flatMap((member) => memberEntry(member, owner) ?? []);
    }
    return moduleEntry(node) ?? [];
  });
}

export function enclosingOwner(node: TSESTree.Node): string {
  const body = ancestorsOf(node).find(
    (ancestor): ancestor is TSESTree.ClassBody => ancestor.type === AST_NODE_TYPES.ClassBody,
  );
  return body === undefined ? MODULE : className(body);
}

export function calledKey(call: TSESTree.CallExpression, owner: string): string | undefined {
  const { callee } = call;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return `${MODULE}#${callee.name}`;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.object.type === AST_NODE_TYPES.ThisExpression &&
    !callee.computed
    ? `${owner}#${String(nameOf(callee.property))}`
    : undefined;
}

function callsOf(fn: FileFunction, keys: ReadonlySet<string>): Set<string> {
  return new Set(
    descendants(fn.node.body).flatMap((node) => {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return [];
      }
      const passed = node.arguments.flatMap((argument) =>
        argument.type === AST_NODE_TYPES.Identifier ? [`${MODULE}#${argument.name}`] : [],
      );
      return [calledKey(node, fn.owner), ...passed].filter(
        (key): key is string => key !== undefined && keys.has(key),
      );
    }),
  );
}

export function fileCalls(program: TSESTree.Program): FileCalls {
  const functions = new Map(functionsOf(program).map((fn) => [fn.key, fn]));
  const keys = new Set(functions.keys());
  const calls = new Map([...functions.values()].map((fn) => [fn.key, callsOf(fn, keys)]));
  return { functions, calls };
}

export function callsFrom(graph: FileCalls, key: string): ReadonlySet<string> {
  return graph.calls.get(key) ?? new Set<string>();
}

export function reachable(graph: FileCalls, start: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const pending = [...callsFrom(graph, start)];
  for (const key of pending) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    for (const next of callsFrom(graph, key)) {
      pending.push(next);
    }
  }
  return seen;
}

export function isRecursive(graph: FileCalls, key: string): boolean {
  return reachable(graph, key).has(key);
}

export function methodCall(node: TSESTree.Node): MethodCall | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    node.callee.computed
  ) {
    return undefined;
  }
  const { object } = node.callee;
  const receiver =
    object.type === AST_NODE_TYPES.MemberExpression &&
    object.object.type === AST_NODE_TYPES.ThisExpression
      ? nameOf(object.property)
      : nameOf(object);
  return { receiver: receiver ?? '', method: String(nameOf(node.callee.property)) };
}
