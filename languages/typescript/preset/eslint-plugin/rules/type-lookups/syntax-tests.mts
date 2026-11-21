import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { contains } from '../analysis/ancestry.mts';
import { findVariable, type SourceContext } from '../analysis/constant-resolution.mts';
import type { Walk } from './walk-contexts.mts';
import { appendAll } from '../../../../../../shared/lists/lists.mts';

export type TestScope = {
  readonly context: SourceContext;
  readonly walk: Walk;
  readonly lookupName: string | undefined;
};

const { DefinitionType } = TSESLint.Scope;
const CHEAP_METHODS = new Set(['has', 'includes', 'startsWith', 'endsWith', 'test', 'getText']);
const KIND_PROPERTIES = new Set(['kind', 'type']);
const EQUALITY = new Set(['===', '!==', '==', '!=']);
const MAX_DEPTH = 3;
const KIND_TEST = /^is[A-Z]\w*$/u;

function isTypeScriptImport(context: SourceContext, identifier: TSESTree.Identifier): boolean {
  const definition = findVariable(context, identifier, identifier.name)?.defs[0];
  return (
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    definition.parent.source.value === 'typescript'
  );
}

function isTypeScriptKindCall(context: SourceContext, callee: TSESTree.Expression): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return KIND_TEST.test(callee.name) && isTypeScriptImport(context, callee);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    KIND_TEST.test(callee.property.name) &&
    isTypeScriptImport(context, callee.object)
  );
}

type Pending = { readonly node: TSESTree.Node; readonly depth: number };
type Expansion = readonly Pending[] | undefined;
type Expander = (scope: TestScope, node: TSESTree.Node, depth: number) => Expansion;

function at(depth: number, nodes: readonly TSESTree.Node[]): Pending[] {
  return nodes.map((node) => ({ node, depth }));
}

function cheapLocal(scope: TestScope, identifier: TSESTree.Identifier, depth: number): Expansion {
  const variable = findVariable(scope.context, identifier, identifier.name);
  const definition = variable?.defs[0];
  if (definition === undefined) {
    return variable === undefined ? [] : undefined;
  }
  if (!contains(scope.walk.body, definition.name)) {
    return [];
  }
  const init =
    variable?.defs.length === 1 &&
    definition.type === DefinitionType.Variable &&
    definition.parent.kind === 'const'
      ? (definition.node.init ?? undefined)
      : undefined;
  return init === undefined ? undefined : at(depth + 1, [init]);
}

function identifierChildren(scope: TestScope, node: TSESTree.Node, depth: number): Expansion {
  if (node.type !== AST_NODE_TYPES.Identifier || node.name === scope.lookupName) {
    return undefined;
  }
  return node.name === scope.walk.nodeName || node.name === 'undefined'
    ? []
    : cheapLocal(scope, node, depth);
}

function isCheapMethod(callee: TSESTree.Node): callee is TSESTree.MemberExpression {
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    CHEAP_METHODS.has(callee.property.name)
  );
}

function callChildren(scope: TestScope, node: TSESTree.Node, depth: number): Expansion {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.arguments.some((argument) => argument.type === AST_NODE_TYPES.SpreadElement)
  ) {
    return undefined;
  }
  const { callee } = node;
  if (isTypeScriptKindCall(scope.context, callee)) {
    return at(depth, node.arguments);
  }
  return isCheapMethod(callee) ? at(depth, [...node.arguments, callee.object]) : undefined;
}

function operandChildren(_scope: TestScope, node: TSESTree.Node, depth: number): Expansion {
  if (node.type === AST_NODE_TYPES.UnaryExpression) {
    return node.operator === 'delete' ? undefined : at(depth, [node.argument]);
  }
  return node.type === AST_NODE_TYPES.BinaryExpression ||
    node.type === AST_NODE_TYPES.LogicalExpression
    ? at(depth, [node.left, node.right])
    : undefined;
}

function shapeChildren(_scope: TestScope, node: TSESTree.Node, depth: number): Expansion {
  if (node.type === AST_NODE_TYPES.Literal) {
    return [];
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return at(depth, node.expressions);
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return at(depth, node.computed ? [node.object, node.property] : [node.object]);
  }
  return node.type === AST_NODE_TYPES.ChainExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression
    ? at(depth, [node.expression])
    : undefined;
}

const EXPANDERS: ReadonlyMap<string, Expander> = new Map<string, Expander>([
  [AST_NODE_TYPES.Identifier, identifierChildren],
  [AST_NODE_TYPES.CallExpression, callChildren],
  [AST_NODE_TYPES.UnaryExpression, operandChildren],
  [AST_NODE_TYPES.BinaryExpression, operandChildren],
  [AST_NODE_TYPES.LogicalExpression, operandChildren],
  [AST_NODE_TYPES.Literal, shapeChildren],
  [AST_NODE_TYPES.TemplateLiteral, shapeChildren],
  [AST_NODE_TYPES.MemberExpression, shapeChildren],
  [AST_NODE_TYPES.ChainExpression, shapeChildren],
  [AST_NODE_TYPES.TSNonNullExpression, shapeChildren],
  [AST_NODE_TYPES.TSAsExpression, shapeChildren],
]);

export function isSyntaxOnly(scope: TestScope, node: TSESTree.Node): boolean {
  const pending: Pending[] = [{ node, depth: 0 }];
  for (const item of pending) {
    const expand = item.depth > MAX_DEPTH ? undefined : EXPANDERS.get(item.node.type);
    const children = expand?.(scope, item.node, item.depth);
    if (children === undefined) {
      return false;
    }
    appendAll(pending, children);
  }
  return true;
}

function isKindOperand(scope: TestScope, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    KIND_PROPERTIES.has(node.property.name) &&
    isSyntaxOnly(scope, node.object)
  );
}

function isKindValue(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && typeof node.value === 'string') ||
    (node.type === AST_NODE_TYPES.MemberExpression && !node.computed)
  );
}

function isKindLeaf(scope: TestScope, node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.CallExpression) {
    const [only] = node.arguments;
    return (
      isTypeScriptKindCall(scope.context, node.callee) &&
      node.arguments.length === 1 &&
      only !== undefined &&
      isSyntaxOnly(scope, only)
    );
  }
  return (
    node.type === AST_NODE_TYPES.BinaryExpression &&
    EQUALITY.has(node.operator) &&
    ((isKindOperand(scope, node.left) && isKindValue(node.right)) ||
      (isKindOperand(scope, node.right) && isKindValue(node.left)))
  );
}

function kindParts(node: TSESTree.Node): readonly TSESTree.Node[] {
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return [node.left, node.right];
  }
  return node.type === AST_NODE_TYPES.UnaryExpression && node.operator === '!'
    ? [node.argument]
    : [];
}

export function isKindTest(scope: TestScope, node: TSESTree.Node): boolean {
  const pending: TSESTree.Node[] = [node];
  for (const item of pending) {
    const parts = kindParts(item);
    if (parts.length === 0 && !isKindLeaf(scope, item)) {
      return false;
    }
    appendAll(pending, parts);
  }
  return true;
}
