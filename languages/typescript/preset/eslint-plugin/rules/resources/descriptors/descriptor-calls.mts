import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  FS_EXTRA_MODULES,
  FS_MODULES,
  nodeModule,
} from '../../analysis/node/node-sync-modules.mts';
import {
  importedCalleeName,
  moduleBindings,
  type ModuleBindings,
} from '../../analysis/subprocess-calls.mts';
import { ancestorsOf, contains, nameOf } from '../../typed/node-views.mts';

export type DescriptorBindings = {
  readonly fs: ModuleBindings;
  readonly promises: ModuleBindings;
};

const FS_SYNC_MODULES = new Set([...FS_MODULES, ...FS_EXTRA_MODULES]);
const FS_PROMISE_MODULES = new Set(nodeModule('fs/promises'));
const CLOSE = 'close';
const HANDLE_USES = new Set<string>([
  'read',
  'write',
  'readFile',
  'writeFile',
  'appendFile',
  'stat',
  'truncate',
  'sync',
  'datasync',
  'readv',
  'writev',
  'chmod',
  'chown',
  'utimes',
]);

export function descriptorBindings(program: TSESTree.Program): DescriptorBindings {
  return {
    fs: moduleBindings(program, FS_SYNC_MODULES),
    promises: moduleBindings(program, FS_PROMISE_MODULES),
  };
}

function viaPromisesProperty(callee: TSESTree.MemberExpression, fs: ModuleBindings): boolean {
  const { object } = callee;
  return (
    object.type === AST_NODE_TYPES.MemberExpression &&
    !object.computed &&
    nameOf(object.property) === 'promises' &&
    nameOf(object.object) !== undefined &&
    fs.namespaces.has(nameOf(object.object) ?? '')
  );
}

export function isOpenSync(call: TSESTree.CallExpression, bindings: DescriptorBindings): boolean {
  return importedCalleeName(call.callee, bindings.fs) === 'openSync';
}

export function isFileHandleOpen(
  call: TSESTree.CallExpression,
  bindings: DescriptorBindings,
): boolean {
  const { callee } = call;
  if (importedCalleeName(callee, bindings.promises) === 'open') {
    return true;
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || nameOf(callee.property) !== 'open') {
    return false;
  }
  return (
    viaPromisesProperty(callee, bindings.fs) ||
    (callee.object.type === AST_NODE_TYPES.Identifier &&
      bindings.fs.named.get(callee.object.name) === 'promises')
  );
}

export function closesDescriptor(identifier: TSESTree.Node, bindings: DescriptorBindings): boolean {
  const call = identifier.parent;
  return (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments[0] === identifier &&
    ['closeSync', CLOSE].includes(importedCalleeName(call.callee, bindings.fs) ?? '')
  );
}

function insideStdio(identifier: TSESTree.Node): boolean {
  const holder =
    identifier.parent?.type === AST_NODE_TYPES.ArrayExpression ? identifier.parent : identifier;
  const property = holder.parent;
  return (
    property?.type === AST_NODE_TYPES.Property &&
    property.value === holder &&
    nameOf(property.key) === 'stdio'
  );
}

function isProcessStream(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.MemberExpression &&
    node.object.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.object.object) === 'process' &&
    ['stdout', 'stderr'].includes(nameOf(node.object.property) ?? '')
  );
}

export function inStreamOverride(identifier: TSESTree.Node): boolean {
  return ancestorsOf(identifier).some(
    (ancestor) =>
      ancestor.type === AST_NODE_TYPES.AssignmentExpression &&
      isProcessStream(ancestor.left) &&
      contains(ancestor.right, identifier),
  );
}

export function keepsOwnership(identifier: TSESTree.Node, bindings: DescriptorBindings): boolean {
  const call = identifier.parent;
  if (
    call?.type === AST_NODE_TYPES.CallExpression &&
    call.arguments.some((argument) => argument === identifier) &&
    importedCalleeName(call.callee, bindings.fs) !== undefined
  ) {
    return true;
  }
  return insideStdio(identifier);
}

export function handleUse(identifier: TSESTree.Node): 'close' | 'use' | 'other' {
  const member = identifier.parent;
  if (
    member?.type !== AST_NODE_TYPES.MemberExpression ||
    member.object !== identifier ||
    member.computed
  ) {
    return 'other';
  }
  const name = nameOf(member.property) ?? '';
  if (name === CLOSE && member.parent.type === AST_NODE_TYPES.CallExpression) {
    return CLOSE;
  }
  return HANDLE_USES.has(name) ? 'use' : 'other';
}
