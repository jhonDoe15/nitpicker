import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { isFunction, type FunctionNode } from '../../typed/syntax-views.mts';
import type { FlowContext } from '../effects.mts';
import { patternNames, type Fact } from '../facts.mts';
import { inside, outsideFunctions } from '../syntax.mts';

function declaredNames(node: TSESTree.Node): string[] {
  if (node.type === AST_NODE_TYPES.VariableDeclarator) {
    return patternNames(node.id);
  }
  if (
    node.type === AST_NODE_TYPES.FunctionDeclaration ||
    node.type === AST_NODE_TYPES.ClassDeclaration
  ) {
    return node.id === null ? [] : [node.id.name];
  }
  return node.type === AST_NODE_TYPES.CatchClause && node.param !== null
    ? patternNames(node.param)
    : [];
}

function declaredIn(fn: FunctionNode): Set<string> {
  const parameters = fn.params.flatMap((param) => patternNames(param));
  return new Set([...parameters, ...[...inside(fn.body)].flatMap(declaredNames)]);
}

function carried(facts: readonly Fact[], fn: FunctionNode, flow: FlowContext): Fact[] {
  const own = declaredIn(fn);
  return facts.filter(
    (known) =>
      !known.readsMembers &&
      [...known.names].every((name) => !(flow.mutable.has(name) || own.has(name))),
  );
}

/**
 * Remembers, for each function in `expressions`, the facts about names that cannot change and that
 * hold where the function is created.
 */
export function recordCaptures(
  expressions: readonly TSESTree.Node[],
  facts: readonly Fact[],
  flow: FlowContext,
): void {
  const { captured } = flow;
  for (const expression of expressions) {
    for (const node of [...outsideFunctions(expression)].filter(isFunction)) {
      captured.set(node, carried(facts, node, flow));
    }
  }
}
