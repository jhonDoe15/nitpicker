import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isExport, isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import {
  bodyNodesOf,
  containerGetOf,
  isAssignmentLeft,
  memberPropertyName,
  targetNameOf,
} from './worklist-nodes.mts';

const SKIPPED_HELPER_NAME = new RegExp(
  '^(?:join|merge|union|combine|accumulate|lub|widen|addAll|equal|equals|isEqual|same)' +
    '|(?:Join|Merge|Union|Equal|Equals)$',
  'u',
);
const MAX_HELPER_DEPTH = 3;

function recordStatementFunctions(statement: TSESTree.Node, map: Map<string, FunctionNode>): void {
  const decl = isExport(statement) ? statement.declaration : statement;
  if (decl?.type === AST_NODE_TYPES.FunctionDeclaration && decl.id !== null) {
    map.set(decl.id.name, decl);
    return;
  }
  const declarations = decl?.type === AST_NODE_TYPES.VariableDeclaration ? decl.declarations : [];
  for (const item of declarations) {
    const init = item.init === null ? undefined : unwrapped(item.init);
    if (item.id.type === AST_NODE_TYPES.Identifier && init !== undefined && isFunction(init)) {
      map.set(item.id.name, init);
    }
  }
}

function recordClassMethods(body: TSESTree.ClassBody, map: Map<string, FunctionNode>): void {
  for (const element of body.body) {
    if (element.type !== AST_NODE_TYPES.MethodDefinition || element.computed) {
      continue;
    }
    const key = memberPropertyName(element.key);
    if (key !== undefined && isFunction(element.value)) {
      map.set(`this.${key}`, element.value);
    }
  }
}

function recordAncestorFunctions(ancestor: TSESTree.Node, map: Map<string, FunctionNode>): void {
  if (ancestor.type === AST_NODE_TYPES.ClassBody) {
    recordClassMethods(ancestor, map);
    return;
  }
  if (ancestor.type !== AST_NODE_TYPES.Program && ancestor.type !== AST_NODE_TYPES.BlockStatement) {
    return;
  }
  for (const stmt of ancestor.body) {
    recordStatementFunctions(stmt, map);
  }
}

export function localFunctionsFor(node: TSESTree.Node): Map<string, FunctionNode> {
  const map = new Map<string, FunctionNode>();
  for (const ancestor of ancestorsOf(node).toReversed()) {
    recordAncestorFunctions(ancestor, map);
  }
  return map;
}

function helperCallName(node: TSESTree.CallExpression): string | undefined {
  const name = targetNameOf(node.callee);
  if (name === undefined) {
    return undefined;
  }
  const leaf = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
  return SKIPPED_HELPER_NAME.test(leaf) ? undefined : name;
}

function directHelperCallsOf(
  nodes: readonly TSESTree.Node[],
  helpers: ReadonlyMap<string, FunctionNode>,
): string[] {
  const called: string[] = [];
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const name = helperCallName(node);
    if (name !== undefined && helpers.has(name)) {
      called.push(name);
    }
  }
  return called;
}

type HelperWalkState = {
  readonly helpers: ReadonlyMap<string, FunctionNode>;
  readonly visited: Set<string>;
  readonly result: FunctionNode[];
};

function expandHelperFrontier(frontier: readonly string[], state: HelperWalkState): string[] {
  const next: string[] = [];
  for (const name of frontier) {
    if (state.visited.has(name)) {
      continue;
    }
    state.visited.add(name);
    const fn = state.helpers.get(name);
    if (fn !== undefined) {
      state.result.push(fn);
      next.push(...directHelperCallsOf(bodyNodesOf(fn.body), state.helpers));
    }
  }
  return next;
}

export function calledHelpersOf(
  nodes: readonly TSESTree.Node[],
  helpers: ReadonlyMap<string, FunctionNode>,
): FunctionNode[] {
  const state: HelperWalkState = { helpers, visited: new Set(), result: [] };
  let frontier = directHelperCallsOf(nodes, helpers);
  for (let depth = 0; depth < MAX_HELPER_DEPTH && frontier.length > 0; depth += 1) {
    frontier = expandHelperFrontier(frontier, state);
  }
  return state.result;
}

function paramNameAt(fn: FunctionNode, index: number): string | undefined {
  const param = fn.params[index];
  return param?.type === AST_NODE_TYPES.Identifier ? param.name : undefined;
}

function collectParamReads(fn: FunctionNode, paramName: string, out: Set<string>): void {
  for (const node of bodyNodesOf(fn.body)) {
    if (isAssignmentLeft(node)) {
      continue;
    }
    const access = containerGetOf(node);
    if (access !== undefined && access.key === paramName) {
      out.add(access.container);
    }
  }
}

export function helperReadContainersOf(
  nodes: readonly TSESTree.Node[],
  nodeVar: string,
  helpers: ReadonlyMap<string, FunctionNode>,
): Set<string> {
  const containers = new Set<string>();
  for (const node of nodes) {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    const name = helperCallName(node);
    const fn = name === undefined ? undefined : helpers.get(name);
    if (fn === undefined) {
      continue;
    }
    const argIndex = node.arguments.findIndex((arg) => nameOf(unwrapped(arg)) === nodeVar);
    const paramName = argIndex === -1 ? undefined : paramNameAt(fn, argIndex);
    if (paramName !== undefined) {
      collectParamReads(fn, paramName, containers);
    }
  }
  return containers;
}
