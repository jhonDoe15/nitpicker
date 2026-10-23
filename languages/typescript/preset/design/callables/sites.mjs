import ts from 'typescript';
import { depthFirst } from '../../../../../shared/traversal.mjs';
import { syntaxChildren } from '../../syntax/children.mjs';
import { wrappedFunction } from '../syntax/function-values.mjs';
import { columnOf, isClosure, lineOf, memberName, unwrap } from '../syntax/nodes.mjs';
import { targetSite } from './calls/targets.mjs';

function reserve(registry, candidates, node) {
  const position = `${String(lineOf(node))}:${String(columnOf(node))}`;
  const fallback = `${candidates.at(-1)}@${position}`;
  const id = [...candidates, fallback].find((candidate) => !registry.siteIds.has(candidate));
  registry.siteIds.add(id);
  return id;
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
  const { node, declaration, name } = found;
  const id = reserve(state.registry, [`${file.path}#${name}`], node);
  register(state, {
    id,
    name,
    kind: 'function',
    owner: file.path,
    node,
    declaration,
    file,
    exported: file.exported.has(declaration),
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

function memberKind(member) {
  if (ts.isConstructorDeclaration(member)) {
    return 'constructor';
  }
  return ts.isGetAccessorDeclaration(member) ? 'accessor' : 'method';
}

function memberFunction(member) {
  if (ts.isPropertyDeclaration(member)) {
    return wrappedFunction(member.initializer);
  }
  const isCallable =
    ts.isMethodDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member);
  return isCallable && member.body !== undefined ? member : undefined;
}

function isPrivateMember(member) {
  return (
    (member.name !== undefined && ts.isPrivateIdentifier(member.name)) ||
    (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Private) !== 0
  );
}

function memberSite(entry, file, member) {
  const node = memberFunction(member);
  if (node === undefined) {
    return undefined;
  }
  const name = ts.isConstructorDeclaration(member) ? 'constructor' : memberName(member);
  return {
    name,
    kind: memberKind(member),
    owner: entry.id,
    node,
    declaration: member,
    member,
    classEntry: entry,
    isStatic: (ts.getEffectiveModifierFlags(member) & ts.ModifierFlags.Static) !== 0,
    file,
    exported: entry.exported && !isPrivateMember(member),
    line: lineOf(member.name ?? member),
  };
}

function classSites(state, file, entry) {
  for (const member of entry.node.members) {
    const site = memberSite(entry, file, member);
    if (site === undefined) {
      continue;
    }
    const base = `${entry.id}.${site.name}`;
    const id = reserve(
      state.registry,
      site.isStatic ? [base, `${base}(static)`] : [base],
      site.node,
    );
    register(state, { ...site, id });
    if (site.kind === 'constructor') {
      state.registry.constructorByClass.set(entry.node, state.registry.siteByNode.get(site.node));
    }
  }
}

function statementEntrySites(state, file, statement) {
  for (const found of statementSites(statement)) {
    topLevelSite(state, file, found);
  }
  const entry = state.registry.typeByNode.get(statement);
  if (entry !== undefined && ts.isClassDeclaration(statement)) {
    classSites(state, file, entry);
  }
}

export function collectNamedSites(files, state) {
  for (const file of files) {
    for (const statement of file.sourceFile.statements) {
      statementEntrySites(state, file, statement);
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

function callbacksOf(state, file) {
  return [...depthFirst(file.sourceFile, moduleLevelChildren)]
    .filter((node) => ts.isCallExpression(node) && targetSite(state, node) === undefined)
    .flatMap((call) =>
      call.arguments
        .map(unwrap)
        .filter(isClosure)
        .map((closure) => ({ closure, name: calleeName(call) })),
    );
}

export function collectCallbackSites(files, state) {
  for (const file of files) {
    for (const { closure, name } of callbacksOf(state, file)) {
      const position = `${String(lineOf(closure))}:${String(columnOf(closure))}`;
      register(state, {
        id: reserve(state.registry, [`${file.path}#${name}@${position}`], closure),
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
