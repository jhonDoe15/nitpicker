import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  memberChain,
  memberName,
  someNode,
} from '../../collections/costly-forms/repeated-runs.mts';
import { variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { unwrapped } from '../../typed/syntax-views.mts';
import { declaredInside } from '../support/loop-invariance.mts';

const DOM_LOOKUPS = new Set([
  'getElementById',
  'getElementsByClassName',
  'getElementsByName',
  'getElementsByTagName',
  'querySelector',
  'querySelectorAll',
]);
const DOM_CHANGES = new Set([
  'after',
  'append',
  'appendChild',
  'before',
  'blur',
  'checked',
  'classList',
  'className',
  'click',
  'dataset',
  'disabled',
  'focus',
  'hidden',
  'id',
  'innerHTML',
  'innerText',
  'insertAdjacentElement',
  'insertAdjacentHTML',
  'insertAdjacentText',
  'insertBefore',
  'outerHTML',
  'prepend',
  'remove',
  'removeAttribute',
  'removeChild',
  'replaceChild',
  'replaceChildren',
  'replaceWith',
  'setAttribute',
  'style',
  'textContent',
  'toggleAttribute',
  'value',
]);
const DATA_TYPES = new Set(['Array', 'Map', 'Set', 'WeakMap', 'WeakSet']);
const PURE_FUNCTIONS = new Set(['Boolean', 'Number', 'String']);
const PURE_GLOBALS = new Set([
  'Array',
  'Boolean',
  'console',
  'JSON',
  'Math',
  'Number',
  'Object',
  'String',
]);

function rootOf(node: TSESTree.Node): TSESTree.Node | undefined {
  return memberChain(node).at(-1);
}

function isDocument(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type === AST_NODE_TYPES.Identifier) {
    const variable = variableNamed(sourceCode, value);
    return value.name === 'document' && (variable === undefined || variable.defs.length === 0);
  }
  return (
    value.type === AST_NODE_TYPES.MemberExpression &&
    !value.computed &&
    value.property.type === AST_NODE_TYPES.Identifier &&
    value.property.name === 'document' &&
    value.object.type === AST_NODE_TYPES.Identifier &&
    ['window', 'globalThis'].includes(value.object.name)
  );
}

export function isDocumentLookup(sourceCode: SourceCode, call: TSESTree.Node): boolean {
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(call.callee);
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    DOM_LOOKUPS.has(callee.property.name) &&
    isDocument(sourceCode, callee.object)
  );
}

function ownedRoot(sourceCode: SourceCode, root: TSESTree.Node | undefined): boolean {
  if (root?.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableNamed(sourceCode, root);
  if (variable === undefined || variable.defs.length === 0) {
    return PURE_GLOBALS.has(root.name);
  }
  return isPlainData(variable.defs[0]?.node);
}

function ownedName(sourceCode: SourceCode, target: TSESTree.Node, boundary: TSESTree.Node) {
  const variable =
    target.type === AST_NODE_TYPES.Identifier ? variableNamed(sourceCode, target) : undefined;
  return variable !== undefined && declaredInside(variable, boundary);
}

function isPlainData(declarator: TSESTree.Node | undefined): boolean {
  const init =
    declarator?.type === AST_NODE_TYPES.VariableDeclarator && declarator.init !== null
      ? unwrapped(declarator.init)
      : undefined;
  return (
    init?.type === AST_NODE_TYPES.ArrayExpression ||
    init?.type === AST_NODE_TYPES.ObjectExpression ||
    (init?.type === AST_NODE_TYPES.NewExpression &&
      init.callee.type === AST_NODE_TYPES.Identifier &&
      DATA_TYPES.has(init.callee.name))
  );
}

function changesPage(sourceCode: SourceCode, node: TSESTree.Node, boundary: TSESTree.Node) {
  if (node.type === AST_NODE_TYPES.AwaitExpression || node.type === AST_NODE_TYPES.NewExpression) {
    return node.type === AST_NODE_TYPES.AwaitExpression;
  }
  if (node.type === AST_NODE_TYPES.AssignmentExpression) {
    return (
      !ownedName(sourceCode, node.left, boundary) &&
      (DOM_CHANGES.has(memberName(node.left) ?? '') || !ownedRoot(sourceCode, rootOf(node.left)))
    );
  }
  if (node.type !== AST_NODE_TYPES.CallExpression || isDocumentLookup(sourceCode, node)) {
    return false;
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return !(PURE_FUNCTIONS.has(callee.name) && ownedRoot(sourceCode, callee));
  }
  return (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    DOM_CHANGES.has(memberName(callee) ?? '') ||
    !ownedRoot(sourceCode, rootOf(callee.object))
  );
}

export function leavesPageAlone(sourceCode: SourceCode, boundary: TSESTree.Node): boolean {
  return !someNode(boundary, (node) => changesPage(sourceCode, node, boundary));
}
