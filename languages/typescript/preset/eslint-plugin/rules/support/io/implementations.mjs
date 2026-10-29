import path from 'node:path';
import ts from 'typescript';
import { readLayout } from '../../../../head-policy.mjs';

const layout = readLayout();
const TEST_PATH =
  /(?:^|\/)(?:test|tests|__tests__|__mocks__|test-support|e2e|fixtures|__fixtures__)\/|\.(?:test|spec)\.[^/]+$/u;

function unwrappedExpression(node) {
  const chain = [node];
  for (const current of chain) {
    if (ts.isParenthesizedExpression(current) || ts.isAsExpression(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isFunctionWithBody(node) {
  return (
    node !== undefined &&
    (ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isGetAccessorDeclaration(node)) &&
    node.body !== undefined
  );
}

export function functionLike(declaration) {
  if (isFunctionWithBody(declaration)) {
    return declaration;
  }
  const holdsValue =
    ts.isVariableDeclaration(declaration) ||
    ts.isPropertyDeclaration(declaration) ||
    ts.isPropertyAssignment(declaration);
  const value =
    holdsValue && declaration.initializer && unwrappedExpression(declaration.initializer);
  return isFunctionWithBody(value) ? value : undefined;
}

function aliased(checker, symbol) {
  return symbol !== undefined && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

export function resolvedSymbol(checker, node) {
  return aliased(checker, checker.getSymbolAtLocation(node));
}

export function calleeDeclaration(checker, node) {
  const symbol = resolvedSymbol(checker, node);
  const shorthand = symbol?.declarations?.find(ts.isShorthandPropertyAssignment);
  const target =
    shorthand === undefined
      ? symbol
      : aliased(checker, checker.getShorthandAssignmentValueSymbol(shorthand));
  const declarations = target?.declarations ?? [];
  return (
    declarations.find((declaration) => functionLike(declaration) !== undefined) ?? declarations[0]
  );
}

function isBodiless(declaration) {
  return (
    ts.isMethodSignature(declaration) ||
    ts.isPropertySignature(declaration) ||
    (ts.isMethodDeclaration(declaration) && declaration.body === undefined) ||
    (ts.isPropertyDeclaration(declaration) && declaration.initializer === undefined)
  );
}

function ownerName(container) {
  if (container === undefined) {
    return undefined;
  }
  if (ts.isInterfaceDeclaration(container) || ts.isClassDeclaration(container)) {
    return container.name;
  }
  return ts.isTypeLiteralNode(container) && ts.isTypeAliasDeclaration(container.parent)
    ? container.parent.name
    : undefined;
}

function returnedObjects(fn) {
  if (fn.body === undefined || fn.type === undefined || !ts.isTypeReferenceNode(fn.type)) {
    return [];
  }
  const returned = ts.isBlock(fn.body)
    ? fn.body.statements.filter(ts.isReturnStatement).map(({ expression }) => expression)
    : [fn.body];
  return returned
    .filter((expression) => expression !== undefined)
    .map(unwrappedExpression)
    .filter(ts.isObjectLiteralExpression)
    .map((object) => [fn.type.typeName, object]);
}

function implementedTypes(node) {
  if ((ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.heritageClauses) {
    return node.heritageClauses.flatMap(({ types }) =>
      types.map(({ expression }) => [expression, node]),
    );
  }
  if (ts.isVariableDeclaration(node) && node.type && ts.isTypeReferenceNode(node.type)) {
    const value = node.initializer && unwrappedExpression(node.initializer);
    return value && ts.isObjectLiteralExpression(value) ? [[node.type.typeName, value]] : [];
  }
  return ts.isFunctionLike(node) ? returnedObjects(node) : [];
}

function isTestSource(program, fileName) {
  const relative = path.relative(program.getCurrentDirectory(), fileName).replaceAll('\\', '/');
  return TEST_PATH.test(relative) || layout.isTestFile(relative);
}

function projectFiles(program) {
  return program
    .getSourceFiles()
    .filter(
      (file) =>
        !file.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(file) &&
        !file.fileName.includes('/node_modules/') &&
        !isTestSource(program, file.fileName),
    );
}

function implementationIndex({ program, checker }) {
  const index = new Map();
  const pending = projectFiles(program);
  for (const node of pending) {
    for (const [typeName, implementation] of implementedTypes(node)) {
      const symbol = resolvedSymbol(checker, typeName);
      index.set(symbol, [...(index.get(symbol) ?? []), implementation]);
    }
    ts.forEachChild(node, (child) => {
      pending.push(child);
    });
  }
  return index;
}

function memberNamed(implementation, name) {
  const members = ts.isObjectLiteralExpression(implementation)
    ? implementation.properties
    : implementation.members;
  return members.find(
    (member) => member.name && ts.isIdentifier(member.name) && member.name.text === name,
  );
}

function inheritedFunction(checker, implementation, name) {
  const property = checker.getPropertyOfType(checker.getTypeAtLocation(implementation), name);
  const declaration = property?.declarations?.find((each) => functionLike(each) !== undefined);
  return declaration && functionLike(declaration);
}

function memberFunction(checker, implementation, name) {
  const member = memberNamed(implementation, name);
  if (member === undefined) {
    return ts.isObjectLiteralExpression(implementation)
      ? undefined
      : inheritedFunction(checker, implementation, name);
  }
  if (ts.isShorthandPropertyAssignment(member)) {
    const declaration = checker.getShorthandAssignmentValueSymbol(member)?.valueDeclaration;
    return declaration && functionLike(declaration);
  }
  return functionLike(member);
}

export function implementationsOf(state, declaration) {
  if (ts.isSourceFile(declaration)) {
    return [];
  }
  const name = ownerName(declaration.parent);
  const member =
    declaration.name !== undefined && ts.isIdentifier(declaration.name)
      ? declaration.name.text
      : '';
  if (name === undefined || member === '' || !isBodiless(declaration)) {
    return [];
  }
  state.implementations ??= implementationIndex(state);
  const owner = resolvedSymbol(state.checker, name);
  return (state.implementations.get(owner) ?? [])
    .map((implementation) => memberFunction(state.checker, implementation, member))
    .filter((fn) => fn !== undefined);
}
