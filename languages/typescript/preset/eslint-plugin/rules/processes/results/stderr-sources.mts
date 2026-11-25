import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { findVariable, type SourceContext } from '../../analysis/constant-resolution.mts';
import type { ModuleBindings } from '../../analysis/subprocess-calls.mts';
import { nameOf } from '../../typed/node-views.mts';
import { calleeMethod } from '../process-callees.mts';
import { plainValue, textBase } from '../messages/text-base.mts';

const { DefinitionType } = TSESLint.Scope;
const RESULT_CALLS = new Set([
  'spawnSync',
  'execa',
  'execaSync',
  'execaCommand',
  'execaCommandSync',
  'execaNode',
]);
const PROMISE_CALLS = new Set(['exec', 'execFile']);

type Sources = { readonly context: SourceContext; readonly bindings: ModuleBindings };

function isResultCall({ bindings }: Sources, node: TSESTree.Node | undefined): boolean {
  if (node === undefined) {
    return false;
  }
  const awaited = node.type === AST_NODE_TYPES.AwaitExpression;
  const call = plainValue(awaited ? node.argument : node);
  if (call.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const method = calleeMethod(call.callee, bindings) ?? '';
  return RESULT_CALLS.has(method) || (awaited && PROMISE_CALLS.has(method));
}

function definitionOf(
  context: SourceContext,
  id: TSESTree.Identifier,
): TSESLint.Scope.Definition | undefined {
  const variable = findVariable(context, id, id.name);
  return variable?.defs.length === 1 ? variable.defs[0] : undefined;
}

function heldResult(sources: Sources, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return isResultCall(sources, node);
  }
  const definition = definitionOf(sources.context, node);
  return (
    definition?.type === DefinitionType.Variable &&
    definition.parent.kind === 'const' &&
    definition.node.id.type === AST_NODE_TYPES.Identifier &&
    isResultCall(sources, definition.node.init ?? undefined)
  );
}

function callbackStderr({ bindings }: Sources, definition: TSESLint.Scope.Definition): boolean {
  if (definition.type !== DefinitionType.Parameter) {
    return false;
  }
  const fn = definition.node;
  const call = fn.parent;
  return (
    fn.params[2] === definition.name &&
    call.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.at(-1) === fn &&
    PROMISE_CALLS.has(calleeMethod(call.callee, bindings) ?? '')
  );
}

function destructuredStderr(sources: Sources, definition: TSESLint.Scope.Definition): boolean {
  if (
    definition.type !== DefinitionType.Variable ||
    definition.node.id.type !== AST_NODE_TYPES.ObjectPattern
  ) {
    return false;
  }
  const property = definition.name.parent;
  return (
    property.type === AST_NODE_TYPES.Property &&
    property.value === definition.name &&
    nameOf(property.key) === 'stderr' &&
    isResultCall(sources, definition.node.init ?? undefined)
  );
}

export function isStderrText(sources: Sources, node: TSESTree.Node): boolean {
  const base = textBase(node);
  if (base.type === AST_NODE_TYPES.MemberExpression) {
    return (
      !base.computed &&
      nameOf(base.property) === 'stderr' &&
      heldResult(sources, plainValue(base.object))
    );
  }
  if (base.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = definitionOf(sources.context, base);
  return (
    definition !== undefined &&
    (callbackStderr(sources, definition) || destructuredStderr(sources, definition))
  );
}
