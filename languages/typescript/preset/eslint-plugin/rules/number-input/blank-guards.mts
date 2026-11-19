import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  ancestorsOf,
  depthFirst,
  nameOf,
  variableNamed,
  type SourceCode,
} from '../typed/node-views.mts';
import { isFunction } from '../typed/syntax-views.mts';
import { syntaxChildren } from '../decided/syntax.mts';

const BLANK_MEMBERS = new Set(['trim', 'trimStart', 'trimEnd', 'length']);
const CHECKS = new Set(['isNaN', 'isFinite', 'isInteger', 'isSafeInteger']);
const FLIPPED: Readonly<Record<string, string | undefined>> = {
  '<': '>',
  '>': '<',
  '<=': '>=',
  '>=': '<=',
};
const SHAPES = [
  /^process\.env\./u,
  /^import\.meta\.env\./u,
  /^(?:req|request|ctx)\.(?:query|params|body)\b/u,
  /\bsearchParams\.get\(/u,
  /\bformData\.get\(/u,
  /\.(?:getString|getOptionalString)\(/u,
];

export function hasInputShape(text: string): boolean {
  return SHAPES.some((shape) => shape.test(text.replaceAll('?.', '.')));
}

function enclosing(sourceCode: SourceCode, node: TSESTree.Node): TSESTree.Node {
  return ancestorsOf(node).find(isFunction) ?? sourceCode.ast;
}

function isBlankTest(sourceCode: SourceCode, node: TSESTree.Node, target: string): boolean {
  if (sourceCode.getText(node).replaceAll('?.', '.') !== target.replaceAll('?.', '.')) {
    return false;
  }
  const { parent } = node;
  if (parent === undefined) {
    return false;
  }
  if (parent.type === AST_NODE_TYPES.UnaryExpression) {
    return parent.operator === '!';
  }
  if (parent.type === AST_NODE_TYPES.LogicalExpression) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.IfStatement ||
    parent.type === AST_NODE_TYPES.ConditionalExpression
  ) {
    return parent.test === node;
  }
  if (parent.type === AST_NODE_TYPES.MemberExpression) {
    return parent.object === node && BLANK_MEMBERS.has(nameOf(parent.property) ?? '');
  }
  return (
    parent.type === AST_NODE_TYPES.BinaryExpression &&
    [parent.left, parent.right].some(
      (side) => side.type === AST_NODE_TYPES.Literal && side.value === '',
    )
  );
}

export function isBlankChecked(
  sourceCode: SourceCode,
  coercion: TSESTree.Node,
  value: TSESTree.Node,
): boolean {
  const target = sourceCode.getText(value);
  return [...depthFirst<TSESTree.Node>(enclosing(sourceCode, coercion), syntaxChildren)].some(
    (node) => node !== value && isBlankTest(sourceCode, node, target),
  );
}

function isSelfComparison(node: TSESTree.BinaryExpression): boolean {
  return (
    (node.operator === '!==' || node.operator === '===') &&
    node.left.type === AST_NODE_TYPES.Identifier &&
    node.right.type === AST_NODE_TYPES.Identifier &&
    node.left.name === node.right.name
  );
}

function checkedBy(reference: TSESLint.Scope.Reference): boolean {
  const { parent } = reference.identifier;
  if (parent.type === AST_NODE_TYPES.BinaryExpression) {
    return isSelfComparison(parent);
  }
  if (
    parent.type !== AST_NODE_TYPES.CallExpression ||
    parent.arguments[0] !== reference.identifier
  ) {
    return false;
  }
  const { callee } = parent;
  const name = nameOf(callee.type === AST_NODE_TYPES.MemberExpression ? callee.property : callee);
  return name !== undefined && CHECKS.has(name);
}

function literalNumber(node: TSESTree.Node): number | undefined {
  return node.type === AST_NODE_TYPES.Literal && typeof node.value === 'number'
    ? node.value
    : undefined;
}

function excludesZero(reference: TSESLint.Scope.Reference): boolean {
  const { identifier } = reference;
  const { parent } = identifier;
  if (parent.type !== AST_NODE_TYPES.BinaryExpression) {
    return false;
  }
  const onLeft = parent.left === identifier;
  const bound = literalNumber(onLeft ? parent.right : parent.left);
  const operator = onLeft ? parent.operator : FLIPPED[parent.operator];
  if (bound === undefined || operator === undefined) {
    return false;
  }
  return (
    (operator === '>' && bound === 0) ||
    (operator === '>=' && bound === 1) ||
    (operator === '<' && bound === 1) ||
    (operator === '<=' && bound === 0)
  );
}

export function numberChecks(
  sourceCode: SourceCode,
  coercion: TSESTree.Node,
): { readonly checked: boolean; readonly bounded: boolean } {
  const { parent } = coercion;
  if (parent === undefined) {
    return { checked: false, bounded: false };
  }
  if (parent.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === coercion) {
    const name = nameOf(
      parent.callee.type === AST_NODE_TYPES.MemberExpression
        ? parent.callee.property
        : parent.callee,
    );
    return { checked: name !== undefined && CHECKS.has(name), bounded: false };
  }
  if (parent.type !== AST_NODE_TYPES.VariableDeclarator || parent.init !== coercion) {
    return { checked: false, bounded: false };
  }
  const references = sourceCode
    .getDeclaredVariables(parent)
    .flatMap((variable) => variable.references)
    .filter((reference) => reference.identifier !== parent.id);
  return { checked: references.some(checkedBy), bounded: references.some(excludesZero) };
}

function isSplitElement(sourceCode: SourceCode, identifier: TSESTree.Identifier): boolean {
  const declarator = variableNamed(sourceCode, identifier)?.defs.at(0)?.node;
  const init = declarator?.type === AST_NODE_TYPES.VariableDeclarator ? declarator.init : undefined;
  return (
    declarator?.type === AST_NODE_TYPES.VariableDeclarator &&
    declarator.id.type === AST_NODE_TYPES.ArrayPattern &&
    init?.type === AST_NODE_TYPES.CallExpression &&
    init.callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(init.callee.property) === 'split'
  );
}

export function isSplitPart(sourceCode: SourceCode, value: TSESTree.Node): boolean {
  return [...depthFirst<TSESTree.Node>(value, syntaxChildren)].some(
    (node) => node.type === AST_NODE_TYPES.Identifier && isSplitElement(sourceCode, node),
  );
}
