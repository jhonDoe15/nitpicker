import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  importedCalleeName,
  isPromisify,
  type ModuleBindings,
} from '../analysis/subprocess-calls.mts';
import { nameOf } from '../typed/node-views.mts';

const SYNC_TEMPLATE = '$sync';
const SYNC_MEMBERS = new Map<string, string>([
  ['spawn', 'spawnSync'],
  ['execa', 'execaSync'],
  ['$', SYNC_TEMPLATE],
]);
const SYNC_MEMBER_NAMES = new Set(['sync', 's']);
const TEMPLATE_TAGS = new Set(['execa', 'execaSync', '$', SYNC_TEMPLATE]);

const DISPLAY_NAMES = new Map<string, string>([[SYNC_TEMPLATE, '$.sync']]);

export function displayName(method: string): string {
  return DISPLAY_NAMES.get(method) ?? method;
}

function syncMemberMethod(callee: TSESTree.Node, bindings: ModuleBindings): string | undefined {
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    callee.computed ||
    !SYNC_MEMBER_NAMES.has(nameOf(callee.property) ?? '')
  ) {
    return undefined;
  }
  return SYNC_MEMBERS.get(importedCalleeName(callee.object, bindings) ?? '');
}

export function calleeMethod(callee: TSESTree.Node, bindings: ModuleBindings): string | undefined {
  if (callee.type === AST_NODE_TYPES.CallExpression && isPromisify(callee.callee)) {
    const [wrapped] = callee.arguments;
    return wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
  }
  return syncMemberMethod(callee, bindings) ?? importedCalleeName(callee, bindings);
}

export function promisifiedBinding(
  declarator: TSESTree.VariableDeclarator,
  bindings: ModuleBindings,
): ModuleBindings {
  const { id, init } = declarator;
  if (
    id.type !== AST_NODE_TYPES.Identifier ||
    init?.type !== AST_NODE_TYPES.CallExpression ||
    !isPromisify(init.callee)
  ) {
    return bindings;
  }
  const [wrapped] = init.arguments;
  const name = wrapped === undefined ? undefined : importedCalleeName(wrapped, bindings);
  return name === undefined
    ? bindings
    : { ...bindings, named: new Map(bindings.named).set(id.name, name) };
}

export function templateTag(
  tag: TSESTree.Node,
  bindings: ModuleBindings,
): { method: string; call: TSESTree.CallExpression | undefined } | undefined {
  const callee = tag.type === AST_NODE_TYPES.CallExpression ? tag.callee : tag;
  const method = calleeMethod(callee, bindings);
  if (method === undefined || !TEMPLATE_TAGS.has(method)) {
    return undefined;
  }
  return { method, call: tag.type === AST_NODE_TYPES.CallExpression ? tag : undefined };
}
