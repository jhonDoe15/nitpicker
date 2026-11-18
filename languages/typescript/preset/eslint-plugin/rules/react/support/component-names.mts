import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isFunction, unwrapped, type FunctionNode } from '../../typed/syntax-views.mts';

const componentWrappers = new Set(['memo', 'forwardRef', 'observer']);
const capitalized = /^[A-Z]/u;

export function functionLabel(fn: TSESTree.Node): string | undefined {
  const named = 'id' in fn ? nameOf(fn.id) : undefined;
  if (named !== undefined) {
    return named;
  }
  let owner: TSESTree.Node | undefined = fn.parent;
  while (
    owner?.type === AST_NODE_TYPES.CallExpression &&
    componentWrappers.has(nameOf(unwrapped(owner.callee)) ?? '')
  ) {
    owner = owner.parent;
  }
  return owner?.type === AST_NODE_TYPES.VariableDeclarator ? nameOf(owner.id) : undefined;
}

export function enclosingComponent(
  node: TSESTree.Node,
): { readonly fn: FunctionNode; readonly name: string } | undefined {
  for (const ancestor of ancestorsOf(node)) {
    const label = isFunction(ancestor) ? functionLabel(ancestor) : undefined;
    if (isFunction(ancestor) && label !== undefined && capitalized.test(label)) {
      return { fn: ancestor, name: label };
    }
  }
  return undefined;
}
