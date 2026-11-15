import type TypeScript from 'typescript';
import { ts, depthFirst, syntaxChildren } from '../syntax/typed.mts';
import { wrappedFunction } from '../syntax/function-values.mts';
import { isClosure, lineOf, unwrap } from '../syntax/nodes.mts';
import { scopedStatements } from '../syntax/scopes.mts';
import type { ScopedStatement } from '../syntax/scope-types.mts';
import type { OwnedFile, Registry, Site, SiteNode, State, TypeEntry } from '../design-types.mts';
import { memberSite } from './member-sites.mts';
import { targetSite } from './calls/targets.mts';

type Found = {
  node: SiteNode;
  declaration:
    TypeScript.VariableDeclaration | TypeScript.FunctionDeclaration | TypeScript.ExportAssignment;
  name: string;
};

function reserve(registry: Registry, candidate: string): string {
  const count = (registry.siteCounts.get(candidate) ?? 0) + 1;
  registry.siteCounts.set(candidate, count);
  return count === 1 ? candidate : `${candidate}~${String(count)}`;
}

function register(state: State, site: Site): void {
  const { registry, checker } = state;
  registry.sites.push(site);
  if (site.callback !== true) {
    registry.siteNames.add(site.name);
  }
  registry.siteByNode.set(site.node, site);
  const name = site.node.name;
  const symbol = name === undefined ? undefined : checker.getSymbolAtLocation(name);
  for (const declaration of symbol?.declarations ?? []) {
    if (isClosure(declaration)) {
      registry.siteByNode.set(declaration, site);
    }
  }
}

function topLevelSite(
  state: State,
  file: OwnedFile,
  found: Found & { scope: ScopedStatement },
): void {
  const { node, declaration, name, scope } = found;
  const id = reserve(state.registry, `${file.path}#${scope.prefix}${name}`);
  register(state, {
    id,
    name,
    kind: 'function',
    owner: file.path,
    node,
    declaration,
    file,
    exported: scope.isExported(declaration),
    anchor: scope.anchor,
    line: lineOf(declaration.name ?? node),
  });
}

function variableSites(statement: TypeScript.VariableStatement): Found[] {
  return statement.declarationList.declarations.flatMap((declaration) => {
    const { name } = declaration;
    const node = ts.isIdentifier(name) ? wrappedFunction(declaration.initializer) : undefined;
    return node === undefined || !ts.isIdentifier(name)
      ? []
      : [{ node, declaration, name: name.text }];
  });
}

function statementSites(statement: TypeScript.Statement): Found[] {
  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) {
    return [{ node: statement, declaration: statement, name: statement.name?.text ?? 'default' }];
  }
  if (ts.isVariableStatement(statement)) {
    return variableSites(statement);
  }
  if (!ts.isExportAssignment(statement)) {
    return [];
  }
  const node = wrappedFunction(statement.expression);
  return node === undefined ? [] : [{ node, declaration: statement, name: 'default' }];
}

function classSites(
  state: State,
  owner: {
    entry: TypeEntry;
    file: OwnedFile;
    container: TypeScript.ClassDeclaration | TypeScript.InterfaceDeclaration;
  },
): void {
  const { entry, container } = owner;
  for (const member of container.members) {
    const site = memberSite(owner, member);
    if (site === undefined) {
      continue;
    }
    const base = `${entry.id}.${site.name}`;
    const id = reserve(state.registry, site.isStatic ? `${base}(static)` : base);
    register(state, { ...site, id });
    if (site.kind === 'constructor') {
      state.registry.constructorByClass.set(entry.node, state.registry.siteByNode.get(site.node));
    }
  }
}

function hasMemberSites(
  statement: TypeScript.Statement,
  entry: TypeEntry | undefined,
): statement is TypeScript.ClassDeclaration | TypeScript.InterfaceDeclaration {
  const isContainer = ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement);
  return isContainer && entry !== undefined && entry.node === statement;
}

function statementEntrySites(state: State, file: OwnedFile, scope: ScopedStatement): void {
  const { statement } = scope;
  for (const found of statementSites(statement)) {
    topLevelSite(state, file, { ...found, scope });
  }
  const entry = state.registry.typeByNode.get(statement);
  if (entry !== undefined && hasMemberSites(statement, entry)) {
    classSites(state, { entry, file, container: statement });
  }
}

export function collectNamedSites(files: readonly OwnedFile[], state: State): void {
  for (const file of files) {
    for (const scope of scopedStatements(file)) {
      statementEntrySites(state, file, scope);
    }
  }
}

function moduleLevelChildren(node: TypeScript.Node): TypeScript.Node[] {
  const skipped = isClosure(node) || ts.isClassLike(node) || ts.isTypeNode(node);
  return skipped ? [] : syntaxChildren(node);
}

function calleeName(call: TypeScript.CallExpression): string {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : 'callback';
}

function callbackClosures(
  state: State,
  file: OwnedFile,
): { closure: TypeScript.FunctionLikeDeclaration; name: string }[] {
  return [...depthFirst<TypeScript.Node>(file.sourceFile, moduleLevelChildren)]
    .filter(
      (node): node is TypeScript.CallExpression =>
        ts.isCallExpression(node) && targetSite(state, node) === undefined,
    )
    .flatMap((call) =>
      call.arguments
        .map(unwrap)
        .filter(isClosure)
        .map((closure) => ({ closure, name: calleeName(call) })),
    );
}

function callbacksOf(state: State, file: OwnedFile) {
  const counts = new Map<string, number>();
  return callbackClosures(state, file).map((callback) => {
    const ordinal = (counts.get(callback.name) ?? 0) + 1;
    counts.set(callback.name, ordinal);
    return { ...callback, ordinal };
  });
}

export function collectCallbackSites(files: readonly OwnedFile[], state: State): void {
  for (const file of files) {
    for (const { closure, name, ordinal } of callbacksOf(state, file)) {
      register(state, {
        id: reserve(state.registry, `${file.path}#${name}@${String(ordinal)}`),
        name,
        kind: 'function',
        node: closure,
        declaration: closure,
        file,
        exported: false,
        callback: true,
        line: lineOf(closure),
      });
    }
  }
}
