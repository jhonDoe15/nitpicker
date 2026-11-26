import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  isFunctionNode,
  resolveFunction,
  type SourceContext,
} from '../analysis/constant-resolution.mts';
import { nameOf } from '../typed/node-views.mts';
import { calleeNameOf, unwrapOf, ASSERTION_FORMS } from '../typed/syntax-views.mts';
import type { BatchFunction } from '../dataloaders/batch-functions.mts';

const { DefinitionType } = TSESLint.Scope;

const INPUT_NAMES = new Set([
  'files',
  'paths',
  'filePaths',
  'fileNames',
  'modules',
  'projects',
  'packages',
]);
const LISTING_CALLEES = new Set([
  'readdir',
  'readdirSync',
  'glob',
  'globSync',
  'fastGlob',
  'globby',
]);

function isListing(node: TSESTree.Node): boolean {
  const inner = unwrapOf(node, [...ASSERTION_FORMS, AST_NODE_TYPES.AwaitExpression]);
  return (
    inner.type === AST_NODE_TYPES.CallExpression &&
    LISTING_CALLEES.has(calleeNameOf(inner.callee) ?? '')
  );
}

function isNamedInput(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return INPUT_NAMES.has(node.name);
  }
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    !node.computed &&
    INPUT_NAMES.has(nameOf(node.property) ?? '')
  );
}

function isListedVariable(context: SourceContext, node: TSESTree.Identifier): boolean {
  const definition = findVariable(context, node, node.name)?.defs[0];
  return (
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.init !== null &&
    isListing(definition.node.init)
  );
}

export function isIndependentInputs(context: SourceContext, node: TSESTree.Node): boolean {
  const inner = unwrapOf(node, ASSERTION_FORMS);
  return (
    isNamedInput(inner) ||
    isListing(inner) ||
    (inner.type === AST_NODE_TYPES.Identifier && isListedVariable(context, inner))
  );
}

export function batchFunction(
  context: SourceContext,
  callback: TSESTree.Node | undefined,
): BatchFunction | undefined {
  if (callback === undefined) {
    return undefined;
  }
  if (isFunctionNode(callback)) {
    return callback.type === AST_NODE_TYPES.FunctionDeclaration ? undefined : callback;
  }
  const resolved = resolveFunction(context, callback);
  return resolved !== undefined && isFunctionNode(resolved) ? resolved : undefined;
}
