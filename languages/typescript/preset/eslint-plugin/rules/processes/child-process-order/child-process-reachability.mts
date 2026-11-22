import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  isFunctionNode,
  resolveFunction,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { forEachNode } from '../../analysis/node/wrapper-calls.mts';
import type { ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { calleeMethod, templateTag } from '../process-callees.mts';

const CHILD_PROCESS_METHODS = new Set([
  'spawn',
  'spawnSync',
  'execFile',
  'execFileSync',
  'exec',
  'execSync',
  'fork',
  'execa',
  'execaSync',
  'execaCommand',
  'execaCommandSync',
  'execaNode',
  '$',
  '$sync',
]);

type SearchState = {
  found: boolean;
  readonly bindings: ModuleBindings;
  readonly visited: Set<TSESTree.Node>;
  readonly pending: TSESTree.Node[];
};

function isDirectChildProcess(node: TSESTree.Node, bindings: ModuleBindings): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const method = calleeMethod(node.callee, bindings);
    return method !== undefined && CHILD_PROCESS_METHODS.has(method);
  }
  if (node.type === AST_NODE_TYPES.TaggedTemplateExpression) {
    return templateTag(node.tag, bindings) !== undefined;
  }
  return false;
}

function inspectNode(context: SourceContext, node: TSESTree.Node, state: SearchState): void {
  if (state.found) {
    return;
  }
  if (isDirectChildProcess(node, state.bindings)) {
    state.found = true;
    return;
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return;
  }
  const helper = resolveFunction(context, node.callee);
  if (isFunctionNode(helper) && !state.visited.has(helper)) {
    state.visited.add(helper);
    state.pending.push(helper.body);
  }
}

export function reachesChildProcess(
  context: SourceContext,
  statement: TSESTree.Statement,
  bindings: ModuleBindings,
): boolean {
  if (statement.type === AST_NODE_TYPES.FunctionDeclaration) {
    return false;
  }
  const state: SearchState = {
    found: false,
    bindings,
    visited: new Set(),
    pending: [statement],
  };
  for (const body of state.pending) {
    forEachNode(context, body, (node) => inspectNode(context, node, state));
    if (state.found) {
      return true;
    }
  }
  return false;
}
