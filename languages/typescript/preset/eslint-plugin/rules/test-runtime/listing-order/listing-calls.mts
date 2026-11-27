import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import {
  type SourceCode,
  memberRoot,
  nameOf,
  requiredLiteral,
  variableNamed,
} from '../../typed/node-views.mts';

const { ScopeType } = TSESLint.Scope;
const GLOBBY = 'globby';
const GLOB_SYNC = 'globSync';
const FS_PROMISES = 'fsPromises';

type Kind = 'fs' | typeof FS_PROMISES | 'glob' | 'fastGlob' | typeof GLOBBY;
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
  ['fs/promises', FS_PROMISES],
  ['node:fs/promises', FS_PROMISES],
  ['fs-extra/esm', 'fs'],
  ['glob', 'glob'],
  ['fast-glob', 'fastGlob'],
  [GLOBBY, GLOBBY],
  ['tinyglobby', GLOBBY],
]);
const LISTING_NAMES: Readonly<Record<Kind, ReadonlySet<string>>> = {
  fs: new Set(['readdir', 'readdirSync']),
  fsPromises: new Set(['readdir']),
  glob: new Set(['glob', GLOB_SYNC]),
  fastGlob: new Set(['glob', GLOB_SYNC, 'sync', 'async']),
  globby: new Set(['glob', GLOB_SYNC, GLOBBY, 'globbySync']),
};
const DEFAULT_CALLABLE = new Set<Kind>(['fastGlob', GLOBBY]);
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
  const source = requiredLiteral(call);
  return typeof source === 'string' ? source : undefined;
}

function addDestructured(bindings: ListingBindings, kind: Kind, id: TSESTree.BindingName): void {
  if (id.type !== AST_NODE_TYPES.ObjectPattern) {
    return;
  }
  for (const property of id.properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue;
    }
    const imported = nameOf(property.key);
    const local = nameOf(property.value);
    if (imported !== undefined && local !== undefined && LISTING_NAMES[kind].has(imported)) {
      bindings.named.set(local, imported);
    }
  }
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
  addDestructured(bindings, kind, id);
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

function mocksModule(first: TSESTree.Node | undefined): boolean {
  const mocked = stringArgument(first) ?? '';
  return MODULE_KINDS.has(mocked) || MOCKING_MODULES.has(mocked);
}

export function mocksListing(call: TSESTree.CallExpression): boolean {
  const { callee } = call;
  const method =
    callee.type === AST_NODE_TYPES.MemberExpression ? nameOf(callee.property) : undefined;
  const [first, second] = call.arguments;
  if (MOCK_METHODS.has(method ?? '')) {
    return mocksModule(first);
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
    const declarators =
      statement.type === AST_NODE_TYPES.VariableDeclaration ? statement.declarations : [];
    for (const declarator of declarators) {
      addRequire(bindings, declarator);
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
    node.object.type === AST_NODE_TYPES.Identifier &&
    bindings.namespaces.get(node.object.name) === 'fs';
  return isPromises ? FS_PROMISES : undefined;
}

function isTopLevel(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  const scope =
    node.type === AST_NODE_TYPES.Identifier
      ? variableNamed(sourceCode, node)?.scope.type
      : undefined;
  return scope === ScopeType.module || scope === ScopeType.global;
}

function isListingMember(bindings: ListingBindings, callee: TSESTree.MemberExpression): boolean {
  const kind = namespaceKind(bindings, callee.object);
  return kind !== undefined && LISTING_NAMES[kind].has(nameOf(callee.property) ?? '');
}

export function isListingCall(bindings: ListingBindings, node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  const { sourceCode } = bindings;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return isTopLevel(sourceCode, callee) && bindings.named.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    isTopLevel(sourceCode, memberRoot(callee)) &&
    isListingMember(bindings, callee)
  );
}
