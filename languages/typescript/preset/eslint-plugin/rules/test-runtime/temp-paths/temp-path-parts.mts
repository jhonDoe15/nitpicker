import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import { ASSERTION_FORMS, unwrapOf } from '../../typed/syntax-views.mts';
import { isJoin, isTmpdirCall } from '../../unique-names/time-values.mts';
import { nameOf } from '../../typed/node-views.mts';

export type PathParts = {
  readonly underTemp: boolean;
  readonly processId: boolean;
  readonly parameter: boolean;
};

const UNKNOWN = undefined;
const MAX_DEPTH = 8;
const TEXT_WRAPPERS = new Set(['String']);
const TEMP_ROOT = /^\/tmp(?:\/|$)/u;
const NO_PARTS: PathParts = { underTemp: false, processId: false, parameter: false };
const { DefinitionType } = TSESLint.Scope;

function isProcessId(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    nameOf(node.object) === 'process' &&
    nameOf(node.property) === 'pid'
  );
}

function merged(parts: readonly (PathParts | undefined)[]): PathParts | undefined {
  if (parts.includes(UNKNOWN)) {
    return UNKNOWN;
  }
  const known = parts.filter((part): part is PathParts => part !== UNKNOWN);
  return {
    underTemp: known.some((part) => part.underTemp),
    processId: known.some((part) => part.processId),
    parameter: known.some((part) => part.parameter),
  };
}

function literalParts(value: unknown): PathParts | undefined {
  if (typeof value === 'string') {
    return { ...NO_PARTS, underTemp: TEMP_ROOT.test(value) };
  }
  return typeof value === 'number' ? NO_PARTS : UNKNOWN;
}

function templateParts(
  context: SourceContext,
  node: TSESTree.TemplateLiteral,
  depth: number,
): PathParts | undefined {
  const head = node.quasis[0]?.value.cooked ?? '';
  const expressions = node.expressions.map((part) => pathParts(context, part, depth + 1));
  return merged([literalParts(head), ...expressions]);
}

function callParts(
  context: SourceContext,
  node: TSESTree.CallExpression,
  depth: number,
): PathParts | undefined {
  if (isTmpdirCall(node)) {
    return { ...NO_PARTS, underTemp: true };
  }
  if (isJoin(node)) {
    return merged(node.arguments.map((part) => pathParts(context, part, depth + 1)));
  }
  const [only] = node.arguments;
  if (TEXT_WRAPPERS.has(nameOf(node.callee) ?? '') && node.arguments.length === 1 && only) {
    return pathParts(context, only, depth + 1);
  }
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'toString' &&
    node.arguments.length === 0 &&
    isProcessId(callee.object)
    ? { ...NO_PARTS, processId: true }
    : UNKNOWN;
}

function identifierParts(
  context: SourceContext,
  node: TSESTree.Identifier,
  depth: number,
): PathParts | undefined {
  const variable = findVariable(context, node, node.name);
  const definition = variable?.defs.length === 1 ? variable.defs[0] : UNKNOWN;
  if (definition?.type === DefinitionType.Parameter) {
    return variable?.references.every((use) => use.isReadOnly())
      ? { ...NO_PARTS, parameter: true }
      : UNKNOWN;
  }
  const isConstant =
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === AST_NODE_TYPES.Identifier;
  const init = isConstant ? definition.node.init : UNKNOWN;
  return init ? pathParts(context, init, depth + 1) : UNKNOWN;
}

export function pathParts(
  context: SourceContext,
  start: TSESTree.Node,
  depth = 0,
): PathParts | undefined {
  const node = unwrapOf(start, ASSERTION_FORMS);
  if (depth > MAX_DEPTH) {
    return UNKNOWN;
  }
  if (isProcessId(node)) {
    return { ...NO_PARTS, processId: true };
  }
  switch (node.type) {
    case AST_NODE_TYPES.Literal: {
      return literalParts(node.value);
    }
    case AST_NODE_TYPES.TemplateLiteral: {
      return templateParts(context, node, depth);
    }
    case AST_NODE_TYPES.BinaryExpression: {
      return node.operator === '+'
        ? merged([
            pathParts(context, node.left, depth + 1),
            pathParts(context, node.right, depth + 1),
          ])
        : UNKNOWN;
    }
    case AST_NODE_TYPES.CallExpression: {
      return callParts(context, node, depth);
    }
    case AST_NODE_TYPES.Identifier: {
      return identifierParts(context, node, depth);
    }
    default: {
      return UNKNOWN;
    }
  }
}

export function isSharedTempPath(parts: PathParts | undefined): parts is PathParts {
  return parts !== UNKNOWN && parts.underTemp && (!parts.parameter || parts.processId);
}
