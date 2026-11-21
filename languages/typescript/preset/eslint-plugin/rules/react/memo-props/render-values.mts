import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import {
  isCallback,
  isFunction,
  TYPE_WRAPPERS,
  unwrapOf,
  type FunctionNode,
} from '../../typed/syntax-views.mts';
import { functionLabel } from '../support/component-names.mts';

export type UnstableKind = 'object' | 'array' | 'function' | 'element';

const { DefinitionType } = TSESLint.Scope;
const FUNCTION = 'function';
const listMethods = new Set(['map', 'flatMap']);
const capitalized = /^[A-Z]/u;
const kindsByType: Readonly<Partial<Record<AST_NODE_TYPES, UnstableKind>>> = {
  [AST_NODE_TYPES.ObjectExpression]: 'object',
  [AST_NODE_TYPES.ArrayExpression]: 'array',
  [AST_NODE_TYPES.ArrowFunctionExpression]: FUNCTION,
  [AST_NODE_TYPES.FunctionExpression]: FUNCTION,
  [AST_NODE_TYPES.FunctionDeclaration]: FUNCTION,
  [AST_NODE_TYPES.JSXElement]: 'element',
  [AST_NODE_TYPES.JSXFragment]: 'element',
};

function isListCallback(fn: FunctionNode): boolean {
  const call = fn.parent;
  if (call.type !== AST_NODE_TYPES.CallExpression || !isCallback(fn)) {
    return false;
  }
  const callee = unwrapOf(call.callee, TYPE_WRAPPERS);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    callee.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return false;
  }
  const method = callee.property.name;
  const isArrayFrom =
    method === 'from' &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    callee.object.name === 'Array' &&
    call.arguments[1] === fn;
  return isArrayFrom || (listMethods.has(method) && call.arguments[0] === fn);
}

export function renderFunctionsOf(node: TSESTree.Node): readonly FunctionNode[] {
  const chain: FunctionNode[] = [];
  for (const fn of ancestorsOf(node).filter(isFunction)) {
    chain.push(fn);
    if (!isListCallback(fn)) {
      const label = functionLabel(fn);
      return label !== undefined && capitalized.test(label) && !fn.async ? chain : [];
    }
  }
  return [];
}

function isBindCall(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    !node.callee.computed &&
    node.callee.property.type === AST_NODE_TYPES.Identifier &&
    node.callee.property.name === 'bind'
  );
}

function writtenKind(node: TSESTree.Node): UnstableKind | undefined {
  const plain = unwrapOf(node, TYPE_WRAPPERS);
  return isBindCall(plain) ? FUNCTION : kindsByType[plain.type];
}

function definedKind(
  variable: TSESLint.Scope.Variable,
  renderFunctions: readonly FunctionNode[],
): UnstableKind | undefined {
  const [definition, ...others] = variable.defs;
  const owner = variable.scope.variableScope.block;
  if (
    definition === undefined ||
    others.length > 0 ||
    !renderFunctions.some((fn) => fn === owner)
  ) {
    return undefined;
  }
  if (definition.type === DefinitionType.FunctionName) {
    return FUNCTION;
  }
  const isPlainConst =
    definition.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === AST_NODE_TYPES.Identifier;
  const init = isPlainConst ? definition.node.init : undefined;
  return init === undefined || init === null ? undefined : writtenKind(init);
}

export function unstableKindOf(
  sourceCode: SourceCode,
  value: TSESTree.Node,
  renderFunctions: readonly FunctionNode[],
): UnstableKind | undefined {
  const plain = unwrapOf(value, TYPE_WRAPPERS);
  if (plain.type !== AST_NODE_TYPES.Identifier) {
    return writtenKind(plain);
  }
  const variable = variableNamed(sourceCode, plain);
  return variable === undefined ? undefined : definedKind(variable, renderFunctions);
}
