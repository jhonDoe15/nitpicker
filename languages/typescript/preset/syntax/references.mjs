import ts from 'typescript';

const NOT_REFERENCED_BY = [
  ts.isImportSpecifier,
  ts.isExportSpecifier,
  ts.isImportClause,
  ts.isNamespaceImport,
  ts.isNamespaceExport,
  ts.isExportAssignment,
  ts.isLabeledStatement,
  ts.isBreakOrContinueStatement,
];
const DECLARED_BY = [
  ts.isParameter,
  ts.isVariableDeclaration,
  ts.isBindingElement,
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isClassDeclaration,
  ts.isClassExpression,
  ts.isTypeParameterDeclaration,
];

function descendants(roots) {
  const nodes = [...roots];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes;
}

const FILE_NODES = new WeakMap();

export function fileNodes(sourceFile) {
  if (!FILE_NODES.has(sourceFile)) FILE_NODES.set(sourceFile, descendants([sourceFile]));
  return FILE_NODES.get(sourceFile);
}

function isReference(node) {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) return true;
  if (parent.name === node) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === node) return false;
  if (ts.isQualifiedName(parent)) return parent.left === node;
  return !NOT_REFERENCED_BY.some((matches) => matches(parent));
}

export function declaredNames(nodes) {
  return new Set(
    descendants(nodes)
      .filter(ts.isIdentifier)
      .filter(
        (node) => DECLARED_BY.some((matches) => matches(node.parent)) && node.parent.name === node,
      )
      .map(({ text }) => text),
  );
}

function readIdentifiers(nodes, ignored) {
  const skipped = new Set(ignored);
  return descendants(nodes)
    .filter(ts.isIdentifier)
    .filter((node) => isReference(node) && !skipped.has(node));
}

export function referencedNames(nodes, ignored = []) {
  return new Set(readIdentifiers(nodes, ignored).map(({ text }) => text));
}

function memberOf(node) {
  const parent = node.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return parent.name.text;
  }
  if (
    ts.isElementAccessExpression(parent) &&
    parent.expression === node &&
    ts.isStringLiteralLike(parent.argumentExpression)
  ) {
    return parent.argumentExpression.text;
  }
  return ts.isQualifiedName(parent) && parent.left === node ? parent.right.text : undefined;
}

export function referenceMembers(nodes, ignored = []) {
  const reads = Map.groupBy(readIdentifiers(nodes, ignored), ({ text }) => text);
  return new Map(
    [...reads].map(([name, identifiers]) => {
      const members = identifiers.map(memberOf);
      return [name, members.includes(undefined) ? undefined : [...new Set(members)].toSorted()];
    }),
  );
}

export function referencePositions(sourceFile) {
  const positions = new Map();
  for (const node of fileNodes(sourceFile).filter(ts.isIdentifier).filter(isReference)) {
    positions.set(node.text, [...(positions.get(node.text) ?? []), node.getStart(sourceFile)]);
  }
  return positions;
}

export function jsxTagNames(sourceFile) {
  return new Set(
    fileNodes(sourceFile)
      .filter((node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      .map(({ tagName }) => tagName.getText(sourceFile)),
  );
}
