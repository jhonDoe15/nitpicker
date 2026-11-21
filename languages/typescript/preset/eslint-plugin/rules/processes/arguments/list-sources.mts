import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  findVariable,
  resolveConstant,
  type SourceContext,
} from '../../analysis/constant-resolution.mts';
import { chainOf, nameOf } from '../../typed/node-views.mts';

type MaybeNode = TSESTree.Node | undefined;

const { DefinitionType } = TSESLint.Scope;

const LISTINGS = new Set([
  'readdirSync',
  'readdir',
  'globSync',
  'glob',
  'globby',
  'globbySync',
  'fastGlob',
  'fg',
  'walkSync',
]);
const GLOB_OWNERS = new Set(['glob', 'fg', 'fastGlob', 'fastglob', 'globby']);
const FS_OWNERS = new Set(['fs', 'fsp', 'fsPromises', 'promises', 'fse', 'fsExtra']);
const DIRECTORY_READS = new Set(['readdir', 'readdirSync']);
const PASS_STEPS = new Set([
  'filter',
  'map',
  'flatMap',
  'flat',
  'sort',
  'toSorted',
  'reverse',
  'concat',
]);
const MAX_SOURCES = 32;

function inner(node: TSESTree.Node): TSESTree.Node | undefined {
  if (node.type === AST_NODE_TYPES.AwaitExpression) {
    return node.argument;
  }
  return node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.ChainExpression
    ? node.expression
    : undefined;
}

export function resolvedValue(context: SourceContext, node: MaybeNode): TSESTree.Node | undefined {
  const seen = new Set<TSESTree.Node>();
  const steps = chainOf(node, (current) => {
    seen.add(current);
    const resolved = resolveConstant(context, current) ?? current;
    const next = resolved === current ? inner(current) : resolved;
    return next !== undefined && seen.has(next) ? undefined : next;
  });
  return steps.at(-1);
}

function isListingCall(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.MemberExpression) {
    const name = nameOf(callee.property) ?? '';
    const owner = nameOf(callee.object) ?? '';
    if (DIRECTORY_READS.has(name)) {
      return FS_OWNERS.has(owner);
    }
    return GLOB_OWNERS.has(owner) && (LISTINGS.has(name) || name === 'sync');
  }
  return LISTINGS.has(nameOf(callee) ?? '');
}

function listingSources(value: TSESTree.Node): readonly MaybeNode[] {
  if (value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.flatMap((element) =>
      element?.type === AST_NODE_TYPES.SpreadElement ? [element.argument] : [],
    );
  }
  if (value.type !== AST_NODE_TYPES.CallExpression) {
    return [];
  }
  const { callee } = value;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return [];
  }
  if (nameOf(callee.object) === 'Array' && nameOf(callee.property) === 'from') {
    return [value.arguments[0]];
  }
  return PASS_STEPS.has(nameOf(callee.property) ?? '') ? [callee.object] : [];
}

export function isListing(context: SourceContext, start: MaybeNode): boolean {
  const pending = [start];
  for (const node of pending) {
    const value = resolvedValue(context, node);
    if (value === undefined || pending.length > MAX_SOURCES) {
      continue;
    }
    if (value.type === AST_NODE_TYPES.CallExpression && isListingCall(value.callee)) {
      return true;
    }
    for (const source of listingSources(value)) {
      pending.push(source);
    }
  }
  return false;
}

export function joinedList(
  node: TSESTree.Node,
): { list: TSESTree.Node; separator: MaybeNode } | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression ||
    nameOf(node.callee.property) !== 'join'
  ) {
    return undefined;
  }
  return { list: node.callee.object, separator: node.arguments[0] };
}

const PATH_MODULES = new Set(['path', 'node:path']);

export function isPathDelimiter(context: SourceContext, node: MaybeNode): boolean {
  if (node === undefined) {
    return false;
  }
  if (node.type === AST_NODE_TYPES.MemberExpression) {
    return (
      nameOf(node.property) === 'delimiter' &&
      ['path', 'posix', 'win32'].includes(nameOf(node.object) ?? '')
    );
  }
  if (node.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const definition = findVariable(context, node, node.name)?.defs[0];
  return (
    definition?.type === DefinitionType.ImportBinding &&
    definition.parent.type === AST_NODE_TYPES.ImportDeclaration &&
    PATH_MODULES.has(definition.parent.source.value) &&
    nameOf(
      definition.node.type === AST_NODE_TYPES.ImportSpecifier
        ? definition.node.imported
        : undefined,
    ) === 'delimiter'
  );
}
