import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { appendAll } from '../../../../../../../shared/lists/lists.mts';
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

type Expansion = PathParts | readonly TSESTree.Node[] | undefined;

function isChildren(expansion: Expansion): expansion is readonly TSESTree.Node[] {
  return Array.isArray(expansion);
}

function callParts(node: TSESTree.CallExpression): Expansion {
  if (isTmpdirCall(node)) {
    return { ...NO_PARTS, underTemp: true };
  }
  if (isJoin(node)) {
    return node.arguments;
  }
  const [only] = node.arguments;
  if (TEXT_WRAPPERS.has(nameOf(node.callee) ?? '') && node.arguments.length === 1 && only) {
    return [only];
  }
  const { callee } = node;
  return callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'toString' &&
    node.arguments.length === 0 &&
    isProcessId(callee.object)
    ? { ...NO_PARTS, processId: true }
    : UNKNOWN;
}

function identifierParts(context: SourceContext, node: TSESTree.Identifier): Expansion {
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
  return init ? [init] : UNKNOWN;
}

function expansionOf(context: SourceContext, node: TSESTree.Node): Expansion {
  if (isProcessId(node)) {
    return { ...NO_PARTS, processId: true };
  }
  if (node.type === AST_NODE_TYPES.Literal) {
    return literalParts(node.value);
  }
  if (node.type === AST_NODE_TYPES.TemplateElement) {
    return literalParts(node.value.cooked ?? '');
  }
  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return [...node.quasis.slice(0, 1), ...node.expressions];
  }
  if (node.type === AST_NODE_TYPES.BinaryExpression) {
    return node.operator === '+' ? [node.left, node.right] : UNKNOWN;
  }
  if (node.type === AST_NODE_TYPES.CallExpression) {
    return callParts(node);
  }
  return node.type === AST_NODE_TYPES.Identifier ? identifierParts(context, node) : UNKNOWN;
}

export function pathParts(context: SourceContext, start: TSESTree.Node): PathParts | undefined {
  const pending = [{ node: start, depth: 0 }];
  const leaves: (PathParts | undefined)[] = [];
  for (const { node, depth } of pending) {
    const expansion =
      depth > MAX_DEPTH ? UNKNOWN : expansionOf(context, unwrapOf(node, ASSERTION_FORMS));
    if (isChildren(expansion)) {
      appendAll(
        pending,
        expansion.map((child) => ({ node: child, depth: depth + 1 })),
      );
    } else {
      leaves.push(expansion);
    }
  }
  return merged(leaves);
}

export function isSharedTempPath(parts: PathParts | undefined): parts is PathParts {
  return parts !== UNKNOWN && parts.underTemp && (!parts.parameter || parts.processId);
}
