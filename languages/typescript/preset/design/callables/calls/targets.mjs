import { ts } from '../../../../typescript-api/typescript-api.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { wrappedFunction } from '../../syntax/function-values.mjs';
import { unwrap } from '../../syntax/nodes.mjs';
import { followAlias } from '../../types/type-lookup.mjs';
import { symbolOf } from '../scope.mjs';

function declaredFunction(declaration) {
  if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) {
    return wrappedFunction(declaration.initializer);
  }
  return ts.isExportAssignment(declaration) ? wrappedFunction(declaration.expression) : undefined;
}

function sitesOfSymbol({ checker, registry }, symbol) {
  const found = new Set();
  for (const declaration of followAlias(checker, symbol)?.declarations ?? []) {
    const node = declaredFunction(declaration) ?? declaration;
    const site = registry.siteByNode.get(node);
    if (site !== undefined) {
      found.add(site);
    }
  }
  return found.size === 1 ? [...found][0] : undefined;
}

function bindingNames(clause) {
  const named = clause.namedBindings;
  const elements = named !== undefined && ts.isNamedImports(named) ? named.elements : [];
  return [clause.name, ...elements.map(({ name }) => name)].filter((name) => name !== undefined);
}

function resolvesToSite(scope, binding) {
  const target = followAlias(scope.checker, scope.checker.getSymbolAtLocation(binding));
  return (target?.declarations ?? []).some(
    (declaration) =>
      scope.registry.siteByNode.has(declaredFunction(declaration) ?? declaration) ||
      scope.registry.constructorByClass.has(declaration),
  );
}

function importedNames(scope, sourceFile) {
  const known = scope.registry.importsByFile.get(sourceFile);
  if (known !== undefined) {
    return known;
  }
  const imports = sourceFile.statements.filter(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      scope.mayBeProjectModule(statement.moduleSpecifier.text),
  );
  const bindings = imports.flatMap((statement) =>
    bindingNames(statement.importClause ?? { name: undefined }),
  );
  const names = new Set(
    bindings.filter((binding) => resolvesToSite(scope, binding)).map(({ text }) => text),
  );
  scope.registry.importsByFile.set(sourceFile, names);
  return names;
}

function mayBeProject(scope, identifier) {
  const { registry } = scope;
  return (
    registry.siteNames.has(identifier.text) ||
    registry.classNames.has(identifier.text) ||
    importedNames(scope, identifier.getSourceFile()).has(identifier.text)
  );
}

function nameOf(expression) {
  return ts.isPropertyAccessExpression(expression) ? expression.name : expression;
}

function symbolAt(scope, expression) {
  const node = nameOf(unwrap(expression));
  const isName = ts.isIdentifier(node) || ts.isPrivateIdentifier(node);
  const isLocalCall = ts.isIdentifier(expression) && !mayBeProject(scope, expression);
  return isName && !isLocalCall ? scope.checker.getSymbolAtLocation(node) : undefined;
}

function constructorSite(scope, classSymbol) {
  const target = followAlias(scope.checker, classSymbol);
  for (const declaration of target?.declarations ?? []) {
    const site = scope.registry.constructorByClass.get(declaration);
    if (site !== undefined) {
      return site;
    }
  }
  return undefined;
}

function superSite(scope, call) {
  const enclosing = chainOf(call.parent, (current) =>
    ts.isClassLike(current) ? undefined : current.parent,
  ).at(-1);
  const current = ts.isClassLike(enclosing) ? enclosing : undefined;
  const base = current?.heritageClauses?.find(({ token }) => token === ts.SyntaxKind.ExtendsKeyword)
    ?.types[0];
  return base === undefined ? undefined : constructorSite(scope, symbolAt(scope, base.expression));
}

export function targetSite(scope, node) {
  if (ts.isNewExpression(node)) {
    return constructorSite(scope, symbolAt(scope, node.expression));
  }
  if (ts.isJsxOpeningLikeElement(node)) {
    return sitesOfSymbol(scope, symbolAt(scope, node.tagName));
  }
  const callee = unwrap(node.expression);
  if (callee.kind === ts.SyntaxKind.SuperKeyword) {
    return superSite(scope, node);
  }
  const isProperty = ts.isPropertyAccessExpression(callee);
  if (isProperty && !scope.registry.siteNames.has(callee.name.text)) {
    return undefined;
  }
  return sitesOfSymbol(scope, symbolAt(scope, callee));
}

export function valueSite(scope, node) {
  if (ts.isIdentifier(node)) {
    return mayBeProject(scope, node) ? sitesOfSymbol(scope, symbolOf(scope, node)) : undefined;
  }
  return scope.registry.siteNames.has(node.name.text)
    ? sitesOfSymbol(scope, scope.checker.getSymbolAtLocation(node.name))
    : undefined;
}
