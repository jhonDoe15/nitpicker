import ts from 'typescript';

const ANONYMOUS = '<anonymous>';
const WRAPPERS = [
  ts.isParenthesizedExpression,
  ts.isAsExpression,
  ts.isSatisfiesExpression,
  ts.isNonNullExpression,
  ts.isTypeAssertionExpression,
];

export function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function textOf(sourceFile, name) {
  return ts.isStringLiteralLike(name) ? name.text : name.getText(sourceFile);
}

function inner(node) {
  let current = node;
  while (WRAPPERS.some((is) => is(current))) {
    current = current.expression;
  }
  return current;
}

function unwrap(node) {
  let current = node;
  while (current.parent !== undefined && WRAPPERS.some((is) => is(current.parent))) {
    current = current.parent;
  }
  return current;
}

function bindingName(sourceFile, node) {
  const parent = unwrap(node).parent;
  if (parent === undefined) {
    return undefined;
  }
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    parent.initializer === unwrap(node)
  ) {
    return textOf(sourceFile, parent.name);
  }
  if (ts.isPropertyDeclaration(parent) && parent.initializer === unwrap(node)) {
    return textOf(sourceFile, parent.name);
  }
  if (
    ts.isBinaryExpression(parent) &&
    parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    parent.right === unwrap(node)
  ) {
    return parent.left.getText(sourceFile);
  }
  return ts.isExportAssignment(parent) ? 'default' : undefined;
}

function localName(sourceFile, node) {
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (node.name !== undefined) {
    return textOf(sourceFile, node.name);
  }
  const isDefaultExport = node.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );
  return isDefaultExport ? 'default' : (bindingName(sourceFile, node) ?? ANONYMOUS);
}

function lineRange(sourceFile, node) {
  return {
    start: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    end: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
  };
}

function walk(sourceFile, node, scope, result) {
  let childScope = scope;
  if (ts.isClassLike(node)) {
    childScope = [...scope, node.name?.text ?? bindingName(sourceFile, node) ?? ANONYMOUS];
  } else if (ts.isObjectLiteralExpression(node)) {
    const name = bindingName(sourceFile, node);
    childScope = name === undefined ? scope : [...scope, name];
  } else if (isFunctionLike(node)) {
    childScope = [...scope, localName(sourceFile, node)];
    result.names.set(node, childScope.join('.'));
    result.units.push({
      name: childScope.join('.'),
      kind: 'function',
      ...lineRange(sourceFile, node),
    });
  } else if (
    ts.isPropertyDeclaration(node) &&
    node.initializer !== undefined &&
    !isFunctionLike(inner(node.initializer))
  ) {
    childScope = [...scope, textOf(sourceFile, node.name)];
    result.units.push({
      name: childScope.join('.'),
      kind: 'initializer',
      ...lineRange(sourceFile, node.initializer),
    });
  } else if (ts.isClassStaticBlockDeclaration(node)) {
    childScope = [...scope, '<static>'];
    result.units.push({
      name: childScope.join('.'),
      kind: 'initializer',
      ...lineRange(sourceFile, node),
    });
  }
  ts.forEachChild(node, (child) => {
    walk(sourceFile, child, childScope, result);
  });
}

/**
 * The qualified name of every function of a source file (`Store.save`, `outer.inner`, `arrow`,
 * `obj.prop`, `default`, `run.<anonymous>`) by node, and the units a branch can belong to: the
 * functions and the initializers of class fields and static blocks.
 */
export function functionUnits(sourceFile) {
  const result = { names: new Map(), units: [] };
  walk(sourceFile, sourceFile, [], result);
  return result;
}
