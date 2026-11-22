import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { memberName } from '../../collections/costly-forms/repeated-runs.mts';
import {
  constantInitializer,
  contains,
  depthFirst,
  variableNamed,
  type SourceCode,
} from '../../typed/node-views.mts';
import { unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import {
  CHAIN_METHODS,
  codeChildren,
  DISALLOWED_NODES,
  isGlobalIdentifier,
  isJsonParseCall,
  isRegexNode,
  localFunctionFor,
  PARSING_METHODS,
  PURE_GLOBAL_CALLS,
  PURE_GLOBALS,
  PURE_TEXT_METHODS,
} from './parse-constants.mts';

type PurityCheck = {
  readonly sourceCode: SourceCode;
  readonly fn: FunctionNode;
  readonly visited: ReadonlySet<FunctionNode>;
};

function isModuleConstLiteral(sourceCode: SourceCode, id: TSESTree.Identifier): boolean {
  const init = constantInitializer(sourceCode, id);
  if (init === undefined) {
    return false;
  }
  const value = unwrapped(init);
  return value.type === AST_NODE_TYPES.Literal || isRegexNode(sourceCode, value);
}

function isDeclaredInside(
  sourceCode: SourceCode,
  id: TSESTree.Identifier,
  fn: FunctionNode,
): boolean {
  const variable = variableNamed(sourceCode, id);
  return variable !== undefined && variable.defs.some((def) => contains(fn, def.name));
}

function isPureCallInside(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
  visited: ReadonlySet<FunctionNode>,
): boolean {
  if (isJsonParseCall(sourceCode, call)) {
    return true;
  }
  const callee = unwrapped(call.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (PURE_GLOBAL_CALLS.has(callee.name) && isGlobalIdentifier(sourceCode, callee, callee.name)) {
      return true;
    }
    const localFn = localFunctionFor(sourceCode, callee);
    return localFn !== undefined && isPureTextParser(sourceCode, localFn, visited);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const name = memberName(callee);
  if (isGlobalIdentifier(sourceCode, callee.object, 'Math')) {
    return name !== undefined && name !== 'random';
  }
  return name !== undefined && PURE_TEXT_METHODS.has(name);
}

function isAllowedIdentifier(
  sourceCode: SourceCode,
  id: TSESTree.Identifier,
  fn: FunctionNode,
): boolean {
  if (id.parent.type === AST_NODE_TYPES.CallExpression && id.parent.callee === id) {
    return true;
  }
  const variable = variableNamed(sourceCode, id);
  if (variable === undefined || variable.defs.length === 0) {
    return PURE_GLOBALS.has(id.name);
  }
  return isDeclaredInside(sourceCode, id, fn) || isModuleConstLiteral(sourceCode, id);
}

function isAllowedNode(check: PurityCheck, node: TSESTree.Node): boolean {
  const { sourceCode, fn, visited } = check;
  if (DISALLOWED_NODES.has(node.type)) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return (
      node.left.type === AST_NODE_TYPES.Identifier && isDeclaredInside(sourceCode, node.left, fn)
    );
  }
  if (node.type === AST_NODE_TYPES.UpdateExpression) {
    return (
      node.argument.type === AST_NODE_TYPES.Identifier &&
      isDeclaredInside(sourceCode, node.argument, fn)
    );
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return (
      isGlobalIdentifier(sourceCode, node.callee, 'RegExp') ||
      isGlobalIdentifier(sourceCode, node.callee, 'URL')
    );
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return isPureCallInside(sourceCode, node, visited);
  }
  if (node.type === AST_NODE_TYPES.Identifier) {
    return isAllowedIdentifier(sourceCode, node, fn);
  }
  return true;
}

function isParsingOp(
  sourceCode: SourceCode,
  node: TSESTree.Node,
  visited: ReadonlySet<FunctionNode>,
): boolean {
  if (isRegexNode(sourceCode, node)) {
    return true;
  }
  if (node.type === AST_NODE_TYPES.NewExpression) {
    return isGlobalIdentifier(sourceCode, node.callee, 'URL');
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  if (isJsonParseCall(sourceCode, node)) {
    return true;
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return PARSING_METHODS.has(memberName(callee) ?? '');
  }
  const localFn = localFunctionFor(sourceCode, callee);
  return localFn !== undefined && isPureTextParser(sourceCode, localFn, visited);
}

export function isPureTextParser(
  sourceCode: SourceCode,
  fn: FunctionNode,
  visited: ReadonlySet<FunctionNode> = new Set(),
): boolean {
  if (fn.async || fn.generator || fn.params.length === 0 || visited.has(fn)) {
    return false;
  }
  const nextVisited = new Set([...visited, fn]);
  const check: PurityCheck = { sourceCode, fn, visited: nextVisited };
  const nodes = [...depthFirst<TSESTree.Node>(fn.body, codeChildren)];
  const allPure = nodes.every((node) => isAllowedNode(check, node));
  return allPure && nodes.some((node) => isParsingOp(sourceCode, node, nextVisited));
}

function isChainedParseReceiver(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(value.callee);
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    return PARSING_METHODS.has(memberName(callee) ?? '');
  }
  const localFn = localFunctionFor(sourceCode, callee);
  return localFn !== undefined && isPureTextParser(sourceCode, localFn);
}

export function isDirectParseCall(sourceCode: SourceCode, call: TSESTree.CallExpression): boolean {
  if (isJsonParseCall(sourceCode, call)) {
    return true;
  }
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee);
  if (method === 'exec') {
    return isRegexNode(sourceCode, callee.object);
  }
  if (method === 'match' || method === 'matchAll' || method === 'search') {
    return true;
  }
  if (
    (method === 'split' || method === 'replace' || method === 'replaceAll') &&
    isRegexNode(sourceCode, call.arguments[0])
  ) {
    return true;
  }
  return (
    method !== undefined &&
    CHAIN_METHODS.has(method) &&
    isChainedParseReceiver(sourceCode, callee.object)
  );
}
