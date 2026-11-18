import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';

type Node = TSESTree.Node;

function isRegExpArgument(parent: Node, node: Node): boolean {
  return (
    (parent.type === AST_NODE_TYPES.NewExpression ||
      parent.type === AST_NODE_TYPES.CallExpression) &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === 'RegExp' &&
    parent.arguments[0] === node
  );
}

function isPassThrough(parent: Node): boolean {
  return (
    parent.type === AST_NODE_TYPES.TemplateLiteral ||
    parent.type === AST_NODE_TYPES.TSAsExpression ||
    parent.type === AST_NODE_TYPES.TSNonNullExpression ||
    (parent.type === AST_NODE_TYPES.BinaryExpression && parent.operator === '+')
  );
}

export type Flow = 'whole' | 'built';

export function reachesRegExp(node: Node): Flow | undefined {
  let current = node;
  while (current.parent != null) {
    const { parent } = current;
    if (isRegExpArgument(parent, current)) {
      return current === node ? 'whole' : 'built';
    }
    if (!isPassThrough(parent)) {
      return undefined;
    }
    current = parent;
  }
  return undefined;
}

function boundVariable(context: SourceContext, node: Node): TSESLint.Scope.Variable | undefined {
  const holder = node.parent;
  const declared =
    holder != null && holder.type === AST_NODE_TYPES.VariableDeclarator && holder.init === node
      ? holder.id
      : undefined;
  return declared?.type === AST_NODE_TYPES.Identifier
    ? findVariable(context, declared, declared.name)
    : undefined;
}

export function flowsToRegExp(context: SourceContext, node: Node): Flow | undefined {
  const direct = reachesRegExp(node);
  if (direct !== undefined) {
    return direct;
  }
  const variable = boundVariable(context, node);
  if (variable === undefined || variable.defs.length !== 1) {
    return undefined;
  }
  const flows = variable.references
    .filter(({ init }) => init !== true)
    .map(({ identifier }) => reachesRegExp(identifier));
  return flows.includes('whole') ? 'whole' : flows.find((flow) => flow !== undefined);
}
