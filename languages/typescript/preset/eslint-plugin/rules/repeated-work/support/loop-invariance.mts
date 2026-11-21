import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  callbackRole,
  memberChain,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { ancestorsOf, contains, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { isFunction } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;
const MEMO_READS = new Set(['get', 'has']);

export type Repeat = { readonly node: TSESTree.Node; readonly kind: 'loop' | 'callback' };

const VARYING = new Set<string>([
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.ImportExpression,
  AST_NODE_TYPES.NewExpression,
  AST_NODE_TYPES.TaggedTemplateExpression,
  AST_NODE_TYPES.UpdateExpression,
  AST_NODE_TYPES.YieldExpression,
]);

function repeatsChild(loop: TSESTree.Node, child: TSESTree.Node): boolean {
  switch (loop.type) {
    case AST_NODE_TYPES.ForOfStatement:
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
      return child === loop.body;
    default:
      return false;
  }
}

export function innermostRepeat(node: TSESTree.Node): Repeat | undefined {
  const chain = [node, ...ancestorsOf(node)];
  for (const [index, ancestor] of chain.entries()) {
    const child = chain[index - 1];
    if (child !== undefined && repeatsChild(ancestor, child)) {
      return { node: ancestor, kind: 'loop' };
    }
    if (index > 0 && isFunction(ancestor)) {
      return callbackRole(ancestor) === 'callback'
        ? { node: ancestor, kind: 'callback' }
        : undefined;
    }
  }
  return undefined;
}

export function declaredInside(
  variable: TSESLint.Scope.Variable,
  boundary: TSESTree.Node,
): boolean {
  return variable.defs.some((definition) => contains(boundary, definition.name));
}

export function writtenInside(variable: TSESLint.Scope.Variable, boundary: TSESTree.Node): boolean {
  return variable.references.some(
    (reference) =>
      reference.isWrite() && !reference.init && contains(boundary, reference.identifier),
  );
}

function memberWrittenInside(name: string, boundary: TSESTree.Node): boolean {
  return someNode(boundary, (node) => {
    if (
      node.type !== AST_NODE_TYPES.AssignmentExpression &&
      node.type !== AST_NODE_TYPES.UpdateExpression
    ) {
      return false;
    }
    const target = node.type === AST_NODE_TYPES.AssignmentExpression ? node.left : node.argument;
    const chain = memberChain(target);
    const root = chain.at(-1);
    return chain.length > 1 && root?.type === AST_NODE_TYPES.Identifier && root.name === name;
  });
}

function invariantName(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
  boundary: TSESTree.Node,
): boolean {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length === 0) {
    return identifier.name !== 'arguments';
  }
  return (
    !declaredInside(variable, boundary) &&
    !writtenInside(variable, boundary) &&
    !memberWrittenInside(identifier.name, boundary)
  );
}

export function invariantIn(
  sourceCode: SourceCode,
  expression: TSESTree.Node,
  boundary: TSESTree.Node,
): boolean {
  return !someNode(
    expression,
    (node) =>
      VARYING.has(node.type) ||
      isFunction(node) ||
      (node.type === AST_NODE_TYPES.Identifier && !invariantName(sourceCode, node, boundary)),
  );
}

function isFixedName(sourceCode: SourceCode, node: TSESTree.Identifier, unbound: boolean): boolean {
  const variable = variableNamed(sourceCode, node);
  const definition = variable?.defs[0];
  if (variable === undefined || definition === undefined) {
    return unbound || node.name === 'undefined';
  }
  const fixed =
    definition.type === DefinitionType.Parameter ||
    (definition.type === DefinitionType.Variable && definition.parent.kind === 'const');
  return fixed && variable.references.every((reference) => reference.init || !reference.isWrite());
}

export function readsOnlyFixed(
  sourceCode: SourceCode,
  expression: TSESTree.Node,
  unbound: boolean,
): boolean {
  return !someNode(
    expression,
    (node) =>
      node.type === AST_NODE_TYPES.MemberExpression ||
      node.type === AST_NODE_TYPES.ThisExpression ||
      (node.type === AST_NODE_TYPES.Identifier && !isFixedName(sourceCode, node, unbound)),
  );
}

export function readsMemo(
  body: TSESTree.Node,
  keyed: (argument: TSESTree.Node) => boolean,
): boolean {
  return someNode(
    body,
    (node) =>
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      node.callee.property.type === AST_NODE_TYPES.Identifier &&
      MEMO_READS.has(node.callee.property.name) &&
      node.arguments.some(keyed),
  );
}
