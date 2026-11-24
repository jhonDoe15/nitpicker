import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { resolveConstant, type SourceContext } from '../../analysis/constant-resolution.mts';
import { staticKeyName } from '../../analysis/static-shapes.mts';
import { nameOf, variableNamed, type SourceCode } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapOf, unwrapped } from '../../typed/syntax-views.mts';

const { DefinitionType } = TSESLint.Scope;

const READDIR_CALLS = new Set(['readdir', 'readdirSync']);
const KEEPING_METHODS = new Set(['filter', 'sort', 'toSorted', 'slice', 'reverse', 'toReversed']);
const MAX_STEPS = 16;

export const EXPRESSION_WRAPPERS = [
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSNonNullExpression,
  AST_NODE_TYPES.TSSatisfiesExpression,
  AST_NODE_TYPES.TSTypeAssertion,
  AST_NODE_TYPES.ChainExpression,
];

type Step = {
  readonly readdir?: string | undefined;
  readonly next?: TSESTree.Node | undefined;
};

function isWithFileTypesProperty(property: TSESTree.ObjectLiteralElement): boolean {
  return property.type === AST_NODE_TYPES.Property && staticKeyName(property) === 'withFileTypes';
}

function isFalseLiteral(context: SourceContext, node: TSESTree.Node): boolean {
  const resolved = resolveConstant(context, node);
  return resolved?.type === AST_NODE_TYPES.Literal && resolved.value === false;
}

function lacksWithFileTypes(context: SourceContext, call: TSESTree.CallExpression): boolean {
  const optionsArg = call.arguments[1];
  if (optionsArg === undefined) {
    return true;
  }
  const resolved = resolveConstant(context, optionsArg);
  if (resolved?.type === AST_NODE_TYPES.Literal && typeof resolved.value === 'string') {
    return true;
  }
  if (resolved?.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }
  if (resolved.properties.some((prop) => prop.type === AST_NODE_TYPES.SpreadElement)) {
    return false;
  }
  const flag = resolved.properties.find(isWithFileTypesProperty);
  return flag === undefined
    ? true
    : flag.type === AST_NODE_TYPES.Property && isFalseLiteral(context, flag.value);
}

export function singleWriteInitializer(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const variable = variableNamed(sourceCode, identifier);
  if (variable === undefined || variable.defs.length !== 1) {
    return undefined;
  }
  const [definition] = variable.defs;
  if (definition?.type !== DefinitionType.Variable) {
    return undefined;
  }
  const writes = variable.references.filter((reference) => reference.isWrite());
  if (writes.length !== 1) {
    return undefined;
  }
  return definition.node.init ?? writes[0]?.writeExpr ?? undefined;
}

function thenReceiver(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): TSESTree.Expression | undefined {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  const callback = definition?.type === DefinitionType.Parameter ? definition.node : undefined;
  const call = callback?.parent;
  if (
    callback === undefined ||
    call?.type !== AST_NODE_TYPES.CallExpression ||
    call.arguments[0] !== callback ||
    callback.params[0] !== definition?.name
  ) {
    return undefined;
  }
  return call.callee.type === AST_NODE_TYPES.MemberExpression &&
    !call.callee.computed &&
    nameOf(call.callee.property) === 'then'
    ? call.callee.object
    : undefined;
}

function isEmptyArray(node: TSESTree.Node): boolean {
  const plain = unwrapOf(node, EXPRESSION_WRAPPERS);
  return plain.type === AST_NODE_TYPES.ArrayExpression && plain.elements.length === 0;
}

function branchStep(node: TSESTree.ConditionalExpression): Step {
  if (isEmptyArray(node.alternate)) {
    return { next: node.consequent };
  }
  return isEmptyArray(node.consequent) ? { next: node.alternate } : {};
}

function callStep(context: SourceContext, node: TSESTree.CallExpression): Step {
  const callee = unwrapped(node.callee);
  const name = calleeNameOf(callee);
  if (name !== undefined && READDIR_CALLS.has(name)) {
    return lacksWithFileTypes(context, node) ? { readdir: name } : {};
  }
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    name !== undefined &&
    KEEPING_METHODS.has(name)
  ) {
    return { next: callee.object };
  }
  return {};
}

function sourceStep(context: SourceContext, expression: TSESTree.Node): Step {
  const node = unwrapOf(expression, EXPRESSION_WRAPPERS);
  if (node.type === AST_NODE_TYPES.Identifier) {
    return {
      next:
        thenReceiver(context.sourceCode, node) ?? singleWriteInitializer(context.sourceCode, node),
    };
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return branchStep(node);
  }
  return node.type === AST_NODE_TYPES.CallExpression ? callStep(context, node) : {};
}

export function readdirSourceOf(
  context: SourceContext,
  expression: TSESTree.Node,
): string | undefined {
  const pending = [expression];
  for (const current of pending) {
    if (pending.length > MAX_STEPS) {
      return undefined;
    }
    const step = sourceStep(context, current);
    if (step.next === undefined) {
      return step.readdir;
    }
    pending.push(step.next);
  }
  return undefined;
}
