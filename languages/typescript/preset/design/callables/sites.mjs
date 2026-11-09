import { ts } from '../../../typescript-api/typescript-api.mjs';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';
import { wrappedFunction } from '../syntax/function-values.mjs';
import { isClosure, lineOf, unwrap } from '../syntax/nodes.mjs';
import { scopedStatements } from '../syntax/scopes.mjs';
import { memberSite } from './member-sites.mjs';
import { targetSite } from './calls/targets.mjs';

function reserve(registry, candidate) {
  const count = (registry.siteCounts.get(candidate) ?? 0) + 1;
  registry.siteCounts.set(candidate, count);
  return count === 1 ? candidate : `${candidate}~${String(count)}`;
}

function register(state, site) {
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

function topLevelSite(state, file, found) {
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

function variableSites(statement) {
  return statement.declarationList.declarations.flatMap((declaration) => {
    const node = ts.isIdentifier(declaration.name)
      ? wrappedFunction(declaration.initializer)
      : undefined;
    return node === undefined ? [] : [{ node, declaration, name: declaration.name.text }];
  });
}

function statementSites(statement) {
  if (ts.isFunctionDeclaration(statement) && statement.body !== undefined) {
    return [{ node: statement, declaration: statement, name: statement.name?.text ?? 'default' }];
  }
  if (ts.isVariableStatement(statement)) {
    return variableSites(statement);
  }
  const node = ts.isExportAssignment(statement) ? wrappedFunction(statement.expression) : undefined;
  return node === undefined ? [] : [{ node, declaration: statement, name: 'default' }];
}

function classSites(state, owner) {
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

function hasMemberSites(statement, entry) {
  const isContainer = ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement);
  return isContainer && entry !== undefined && entry.node === statement;
}

function statementEntrySites(state, file, scope) {
  const { statement } = scope;
  for (const found of statementSites(statement)) {
    topLevelSite(state, file, { ...found, scope });
  }
  const entry = state.registry.typeByNode.get(statement);
  if (hasMemberSites(statement, entry)) {
    classSites(state, { entry, file, container: statement });
  }
}

export function collectNamedSites(files, state) {
  for (const file of files) {
    for (const scope of scopedStatements(file)) {
      statementEntrySites(state, file, scope);
    }
  }
}

function moduleLevelChildren(node) {
  const skipped = isClosure(node) || ts.isClassLike(node) || ts.isTypeNode(node);
  return skipped ? [] : syntaxChildren(node);
}

function calleeName(call) {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return ts.isIdentifier(callee) ? callee.text : 'callback';
}

function callbackClosures(state, file) {
  return [...depthFirst(file.sourceFile, moduleLevelChildren)]
    .filter((node) => ts.isCallExpression(node) && targetSite(state, node) === undefined)
    .flatMap((call) =>
      call.arguments
        .map(unwrap)
        .filter(isClosure)
        .map((closure) => ({ closure, name: calleeName(call) })),
    );
}

function callbacksOf(state, file) {
  const counts = new Map();
  return callbackClosures(state, file).map((callback) => {
    const ordinal = (counts.get(callback.name) ?? 0) + 1;
    counts.set(callback.name, ordinal);
    return { ...callback, ordinal };
  });
}

export function collectCallbackSites(files, state) {
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
