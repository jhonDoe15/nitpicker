import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import {
  type SourceCode,
  nameOf,
  requiredLiteral,
  variableNamed,
} from '../../typed/node-views.mts';

type Kind = 'fs' | 'fsPromises' | 'glob' | 'fastGlob' | 'globby';
export type ListingBindings = {
  readonly named: Map<string, string>;
  readonly namespaces: Map<string, Kind>;
  readonly sourceCode: SourceCode;
};

const MODULE_KINDS = new Map<string, Kind>([
  ['fs', 'fs'],
  ['node:fs', 'fs'],
  ['fs-extra', 'fs'],
  ['graceful-fs', 'fs'],
  ['fs/promises', 'fsPromises'],
  ['node:fs/promises', 'fsPromises'],
  ['fs-extra/esm', 'fs'],
  ['glob', 'glob'],
  ['fast-glob', 'fastGlob'],
  ['globby', 'globby'],
  ['tinyglobby', 'globby'],
]);
const LISTING_NAMES: Readonly<Record<Kind, ReadonlySet<string>>> = {
  fs: new Set(['readdir', 'readdirSync']),
  fsPromises: new Set(['readdir']),
  glob: new Set(['glob', 'globSync']),
  fastGlob: new Set(['glob', 'globSync', 'sync', 'async']),
  globby: new Set(['glob', 'globSync', 'globby', 'globbySync']),
};
const DEFAULT_CALLABLE = new Set<Kind>(['fastGlob', 'globby']);
export const MOCKING_MODULES: ReadonlySet<string> = new Set([
  'memfs',
  'mock-fs',
  'memfs/lib/volume',
]);
const MOCK_METHODS = new Set(['mock', 'doMock', 'unstable_mockModule']);
const PROMISES = 'promises';
const NAMESPACE = '*';

function addSpecifier(
  bindings: ListingBindings,
  kind: Kind,
  specifier: TSESTree.ImportClause,
): void {
  if (specifier.type === AST_NODE_TYPES.ImportSpecifier) {
    const imported = nameOf(specifier.imported) ?? '';
    if (LISTING_NAMES[kind].has(imported)) {
      bindings.named.set(specifier.local.name, imported);
    }
    return;
  }
  bindings.namespaces.set(specifier.local.name, kind);
  if (specifier.type === AST_NODE_TYPES.ImportDefaultSpecifier && DEFAULT_CALLABLE.has(kind)) {
    bindings.named.set(specifier.local.name, NAMESPACE);
  }
}

function requiredModule(node: TSESTree.Expression | null): string | undefined {
  const call = node?.type === AST_NODE_TYPES.AwaitExpression ? node.argument : node;
  const source = requiredLiteral(call ?? undefined);
  return typeof source === 'string' ? source : undefined;
}

function addRequire(bindings: ListingBindings, declarator: TSESTree.VariableDeclarator): void {
  const kind = MODULE_KINDS.get(requiredModule(declarator.init) ?? '');
  const { id } = declarator;
  if (kind === undefined) {
    return;
  }
  if (id.type === AST_NODE_TYPES.Identifier) {
    bindings.namespaces.set(id.name, kind);
    return;
  }
  for (const property of id.type === AST_NODE_TYPES.ObjectPattern ? id.properties : []) {
    const imported = property.type === AST_NODE_TYPES.Property ? nameOf(property.key) : undefined;
    const local = property.type === AST_NODE_TYPES.Property ? nameOf(property.value) : undefined;
    if (imported !== undefined && local !== undefined && LISTING_NAMES[kind].has(imported)) {
      bindings.named.set(local, imported);
    }
  }
}

function addImport(bindings: ListingBindings, statement: TSESTree.ImportDeclaration): void {
  const source = statement.source.value;
  const kind = MODULE_KINDS.get(source);
  if (kind === undefined || statement.importKind === 'type') {
    return;
  }
  for (const specifier of statement.specifiers) {
    addSpecifier(bindings, kind, specifier);
  }
}

const SPIES = new Set(['spyOn', 'stub', 'replace']);
const LISTED = new Set(Object.values(LISTING_NAMES).flatMap((names) => [...names]));

function stringArgument(node: TSESTree.Node | undefined): string | undefined {
  return node?.type === AST_NODE_TYPES.Literal && typeof node.value === 'string'
    ? node.value
    : undefined;
}

export function mocksListing(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
  const [first, second] = call.arguments;
  if (MOCK_METHODS.has(method ?? '')) {
    const mocked = stringArgument(first) ?? '';
    return MODULE_KINDS.has(mocked) || MOCKING_MODULES.has(mocked);
  }
  return SPIES.has(method ?? '') && LISTED.has(stringArgument(second) ?? '');
}

export function listingBindings(
  program: TSESTree.Program,
  sourceCode: SourceCode,
): ListingBindings {
  const bindings: ListingBindings = { named: new Map(), namespaces: new Map(), sourceCode };
  for (const statement of program.body) {
    if (statement.type === AST_NODE_TYPES.ImportDeclaration) {
      addImport(bindings, statement);
    }
    if (statement.type === AST_NODE_TYPES.VariableDeclaration) {
      statement.declarations.forEach((declarator) => addRequire(bindings, declarator));
    }
  }
  return bindings;
}

function namespaceKind(bindings: ListingBindings, node: TSESTree.Node): Kind | undefined {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return bindings.namespaces.get(node.name);
  }
  const isPromises =
    node.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(node.property) === PROMISES &&
    namespaceKind(bindings, node.object) === 'fs';
  return isPromises ? 'fsPromises' : undefined;
}

function rootOf(node: TSESTree.Node): TSESTree.Node {
  return node.type === AST_NODE_TYPES.MemberExpression ? rootOf(node.object) : node;
}

function isTopLevel(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const scope =
    node.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, node)?.scope.type
      : undefined;
  return scope === 'module' || scope === 'global';
}

export function isListingCall(bindings: ListingBindings, node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    !isTopLevel(bindings.sourceCode, rootOf(node.callee))
  ) {
    return false;
  }
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return bindings.named.has(callee.name);
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const kind = namespaceKind(bindings, callee.object);
  return kind !== undefined && LISTING_NAMES[kind].has(nameOf(callee.property) ?? '');
}
