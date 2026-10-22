import ts from 'typescript';
import { chainOf } from '../../analysis/ancestry.mjs';
import { tsCallee, tsCallView } from './call-views.mjs';
import { directEffects, namedKind } from './call-tags.mjs';
import { functionLike, implementationsOf, resolvedSymbol } from './implementations.mjs';
import { libraryKind, packageFromPath } from './packages.mjs';

function unwrapped(node) {
  return chainOf(node, (current) =>
    ts.isParenthesizedExpression(current) || ts.isNonNullExpression(current)
      ? current.expression
      : undefined,
  ).at(-1);
}

function calleeParts(call) {
  const callee = unwrapped(tsCallee(call));
  const member = ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee);
  const name = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  return { callee, name, receiver: member ? callee.expression : undefined };
}

function ambientModule(declaration) {
  const module = chainOf(declaration, (node) => node.parent).find(
    (node) => ts.isModuleDeclaration(node) && ts.isStringLiteral(node.name),
  );
  return module?.name.text;
}

function declarationPackage({ program }, declaration) {
  const file = declaration.getSourceFile();
  const library = program.isSourceFileDefaultLibrary(file) ? 'lib' : undefined;
  return ambientModule(declaration) ?? packageFromPath(file.fileName) ?? library;
}

function typeDeclaration({ checker }, node) {
  const type = checker.getNonNullableType(checker.getTypeAtLocation(node));
  return (type.aliasSymbol ?? type.getSymbol())?.declarations?.[0];
}

function hasCallableThen(checker, type, call) {
  const then = checker.getApparentType(type).getProperty('then');
  return (
    then !== undefined &&
    checker.getTypeOfSymbolAtLocation(then, call).getCallSignatures().length > 0
  );
}

function isAsyncCall({ checker }, call) {
  const last = ts.isCallExpression(call) ? call.arguments.at(-1) : undefined;
  if (last !== undefined && (ts.isArrowFunction(last) || ts.isFunctionExpression(last))) {
    return true;
  }
  const type = checker.getTypeAtLocation(call);
  const members = type.isUnion() ? type.types : [type];
  return (
    (type.flags & ts.TypeFlags.Any) !== 0 ||
    members.some((member) => hasCallableThen(checker, member, call))
  );
}

function libraryEffects(state, { call, view }, declarations) {
  function isAsync() {
    return isAsyncCall(state, call);
  }
  const found = declarations
    .filter((declaration) => declaration !== undefined)
    .map((declaration) => declarationPackage(state, declaration))
    .filter((pkg) => pkg !== undefined)
    .map((pkg) => [pkg, libraryKind(pkg, view, isAsync)])
    .find(([, kind]) => kind !== undefined);
  return found === undefined ? undefined : directEffects(found[1], found[0], view);
}

function requiredModule(declaration) {
  const variable = chainOf(declaration, (node) => node.parent).find(ts.isVariableDeclaration);
  const init = variable?.initializer;
  const isRequire =
    init !== undefined &&
    ts.isCallExpression(init) &&
    ts.isIdentifier(init.expression) &&
    init.expression.text === 'require' &&
    init.arguments.length === 1 &&
    ts.isStringLiteral(init.arguments[0]);
  return isRequire ? init.arguments[0].text : undefined;
}

function importedPackage({ checker }, root) {
  const declaration = root && checker.getSymbolAtLocation(root)?.declarations?.[0];
  if (declaration === undefined) {
    return undefined;
  }
  const statement = chainOf(declaration, (node) => node.parent).find(ts.isImportDeclaration);
  return statement !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
    ? statement.moduleSpecifier.text
    : requiredModule(declaration);
}

function namedEffects(state, view) {
  const pkg = importedPackage(state, view.root);
  const kind = pkg === undefined ? undefined : libraryKind(pkg, view, () => true);
  return directEffects(kind ?? namedKind(view), pkg, view);
}

function libraryCallEffects(state, site, declarations) {
  const fetched = site.view.names.length === 1 && namedKind(site.view) === 'remote';
  return fetched
    ? directEffects('remote', undefined, site.view)
    : (libraryEffects(state, site, declarations) ?? new Map());
}

function projectCall(state, site, declaration) {
  const fn = functionLike(declaration);
  const targets = fn === undefined ? implementationsOf(state, declaration) : [fn];
  return targets.length === 0
    ? { view: site.view, effects: namedEffects(state, site.view) }
    : { view: site.view, targets };
}

export function resolveCall(state, call) {
  const site = { call, view: tsCallView(call) };
  const { callee, name, receiver } = calleeParts(call);
  const declaration = resolvedSymbol(state.checker, name)?.declarations?.[0];
  if (declaration === undefined) {
    return { view: site.view, effects: namedEffects(state, site.view) };
  }
  const receiverType = receiver && typeDeclaration(state, receiver);
  const calleeType = typeDeclaration(state, callee);
  if (declarationPackage(state, declaration) !== undefined) {
    const effects = libraryCallEffects(state, site, [receiverType, declaration, calleeType]);
    return { view: site.view, effects };
  }
  const typed = libraryEffects(state, site, [calleeType, receiverType]);
  return typed === undefined
    ? projectCall(state, site, declaration)
    : { view: site.view, effects: typed };
}
