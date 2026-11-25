import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { localFunctionsFor } from '../../recursion/worklist-join/local-helpers.mts';
import { nameOf, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';
import { unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';
import { hasErrorCheck } from './error-checks.mts';

export { localFunctionsFor };

const MAX_HELPER_DEPTH = 3;
const NESTED_DECLARATIONS = new Set<string>([AST_NODE_TYPES.FunctionDeclaration]);

function callTargetName(callee: TSESTree.Node): string | undefined {
  const plain = unwrapped(callee);
  if (plain.type === AST_NODE_TYPES.Identifier) {
    return plain.name;
  }
  if (
    plain.type === AST_NODE_TYPES.MemberExpression &&
    !plain.computed &&
    plain.object.type === AST_NODE_TYPES.ThisExpression
  ) {
    const property = nameOf(plain.property);
    return property === undefined ? undefined : `this.${property}`;
  }
  return undefined;
}

function directHelperCalls(fn: FunctionNode, helpers: ReadonlyMap<string, FunctionNode>): string[] {
  return nodesWithoutNested(fn.body, NESTED_DECLARATIONS, nodeChildren).flatMap((node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) {
      return [];
    }
    const name = callTargetName(node.callee);
    return name !== undefined && helpers.has(name) ? [name] : [];
  });
}

type SearchState = {
  readonly helpers: ReadonlyMap<string, FunctionNode>;
  readonly visited: Set<string>;
};

function expandFrontier(
  frontier: readonly string[],
  state: SearchState,
): { readonly found: boolean; readonly next: string[] } {
  const next: string[] = [];
  for (const name of frontier) {
    if (state.visited.has(name)) {
      continue;
    }
    state.visited.add(name);
    const helper = state.helpers.get(name);
    if (helper === undefined) {
      continue;
    }
    if (hasErrorCheck(helper)) {
      return { found: true, next: [] };
    }
    next.push(...directHelperCalls(helper, state.helpers));
  }
  return { found: false, next };
}

export function calledHelperHasErrorCheck(
  fn: FunctionNode,
  helpers: ReadonlyMap<string, FunctionNode>,
): boolean {
  const state: SearchState = { helpers, visited: new Set() };
  let frontier = directHelperCalls(fn, helpers);
  for (let depth = 0; depth < MAX_HELPER_DEPTH && frontier.length > 0; depth += 1) {
    const step = expandFrontier(frontier, state);
    if (step.found) {
      return true;
    }
    frontier = step.next;
  }
  return false;
}
