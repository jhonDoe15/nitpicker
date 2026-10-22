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
  const chain = [node];
  for (const current of chain) {
    if (WRAPPERS.some((is) => is(current))) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function unwrap(node) {
  const chain = [node];
  for (const current of chain) {
    if (current.parent !== undefined && WRAPPERS.some((is) => is(current.parent))) {
      chain.push(current.parent);
    }
  }
  return chain.at(-1);
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

function classScope(sourceFile, node, scope) {
  if (!ts.isClassLike(node)) {
    return undefined;
  }
  return { scope: [...scope, node.name?.text ?? bindingName(sourceFile, node) ?? ANONYMOUS] };
}

function objectScope(sourceFile, node, scope) {
  if (!ts.isObjectLiteralExpression(node)) {
    return undefined;
  }
  const name = bindingName(sourceFile, node);
  return { scope: name === undefined ? scope : [...scope, name] };
}

function uniqueName(name, scope, anonymousCounts) {
  if (name !== ANONYMOUS) {
    return name;
  }
  const key = scope.join('.');
  const count = (anonymousCounts.get(key) ?? 0) + 1;
  anonymousCounts.set(key, count);
  return count === 1 ? name : `<anonymous#${String(count)}>`;
}

function functionScope(sourceFile, node, scope, anonymousCounts) {
  if (!isFunctionLike(node)) {
    return undefined;
  }
  return {
    scope: [...scope, uniqueName(localName(sourceFile, node), scope, anonymousCounts)],
    unit: { kind: 'function', range: node },
  };
}

function fieldScope(sourceFile, node, scope) {
  if (
    !ts.isPropertyDeclaration(node) ||
    node.initializer === undefined ||
    isFunctionLike(inner(node.initializer))
  ) {
    return undefined;
  }
  return {
    scope: [...scope, textOf(sourceFile, node.name)],
    unit: { kind: 'initializer', range: node.initializer },
  };
}

function staticBlockScope(sourceFile, node, scope) {
  if (!ts.isClassStaticBlockDeclaration(node)) {
    return undefined;
  }
  return { scope: [...scope, '<static>'], unit: { kind: 'initializer', range: node } };
}

const SCOPES = [classScope, objectScope, functionScope, fieldScope, staticBlockScope];

function enter(sourceFile, node, scope, anonymousCounts) {
  for (const scopeOf of SCOPES) {
    const entered = scopeOf(sourceFile, node, scope, anonymousCounts);
    if (entered !== undefined) {
      return entered;
    }
  }
  return { scope };
}

function unitEntry(sourceFile, node, { scope, unit }) {
  return {
    node,
    at: node.getStart(sourceFile),
    name: scope.join('.'),
    kind: unit.kind,
    ...lineRange(sourceFile, unit.range),
  };
}

export function functionUnits(sourceFile) {
  const found = [];
  const anonymousCounts = new Map();
  const pending = [{ node: sourceFile, scope: [] }];
  for (const { node, scope } of pending) {
    const entered = enter(sourceFile, node, scope, anonymousCounts);
    if (entered.unit !== undefined) {
      found.push(unitEntry(sourceFile, node, entered));
    }
    ts.forEachChild(node, (child) => {
      pending.push({ node: child, scope: entered.scope });
    });
  }
  const names = new Map(
    found.filter(({ kind }) => kind === 'function').map(({ node, name }) => [node, name]),
  );
  const units = found
    .toSorted((left, right) => left.at - right.at)
    .map(({ name, kind, start, end }) => ({ name, kind, start, end }));
  return { names, units };
}
