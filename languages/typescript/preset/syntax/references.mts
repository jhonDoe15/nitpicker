import type TypeScript from 'typescript';
import { ts } from './typed/typescript-compiler.mts';
import { cachedValue } from '../../../../shared/values/caching/cached-value.mts';
import { byText } from '../../../../shared/text-order/by-text.mjs';

type Matcher = (node: TypeScript.Node) => boolean;

const NOT_REFERENCED_BY: Matcher[] = [
  ts.isImportSpecifier,
  ts.isExportSpecifier,
  ts.isImportClause,
  ts.isNamespaceImport,
  ts.isNamespaceExport,
  ts.isExportAssignment,
  ts.isLabeledStatement,
  ts.isBreakOrContinueStatement,
];
const DECLARED_BY: Matcher[] = [
  ts.isParameter,
  ts.isVariableDeclaration,
  ts.isBindingElement,
  ts.isFunctionDeclaration,
  ts.isFunctionExpression,
  ts.isClassDeclaration,
  ts.isClassExpression,
  ts.isTypeParameterDeclaration,
];

function descendants(roots: readonly TypeScript.Node[]): TypeScript.Node[] {
  const nodes = [...roots];
  for (const node of nodes) {
    ts.forEachChild(node, (child) => {
      nodes.push(child);
    });
  }
  return nodes;
}

const FILE_NODES = new WeakMap<TypeScript.SourceFile, TypeScript.Node[]>();

export function fileNodes(sourceFile: TypeScript.SourceFile): TypeScript.Node[] {
  return cachedValue(FILE_NODES, sourceFile, () => descendants([sourceFile]));
}

function isReference(node: TypeScript.Identifier): boolean {
  const parent = node.parent;
  if (ts.isShorthandPropertyAssignment(parent)) {
    return true;
  }
  if ('name' in parent && parent.name === node) {
    return false;
  }
  if (ts.isBindingElement(parent) && parent.propertyName === node) {
    return false;
  }
  if (ts.isQualifiedName(parent)) {
    return parent.left === node;
  }
  return !NOT_REFERENCED_BY.some((matches) => matches(parent));
}

export function declaredNames(nodes: readonly TypeScript.Node[]): Set<string> {
  return new Set(
    descendants(nodes)
      .filter(ts.isIdentifier)
      .filter(
        (node) =>
          DECLARED_BY.some((matches) => matches(node.parent)) &&
          'name' in node.parent &&
          node.parent.name === node,
      )
      .map(({ text }) => text),
  );
}

function readIdentifiers(
  nodes: readonly TypeScript.Node[],
  ignored: Iterable<TypeScript.Node>,
): TypeScript.Identifier[] {
  const skipped = new Set(ignored);
  return descendants(nodes)
    .filter(ts.isIdentifier)
    .filter((node) => isReference(node) && !skipped.has(node));
}

export function referencedNames(
  nodes: readonly TypeScript.Node[],
  ignored: Iterable<TypeScript.Node> = [],
): Set<string> {
  return new Set(readIdentifiers(nodes, ignored).map(({ text }) => text));
}

function memberOf(node: TypeScript.Identifier): string | undefined {
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

export function referenceMembers(
  nodes: readonly TypeScript.Node[],
  ignored: Iterable<TypeScript.Node> = [],
): Map<string, (string | undefined)[] | undefined> {
  const reads = Map.groupBy(readIdentifiers(nodes, ignored), ({ text }) => text);
  return new Map(
    [...reads].map(([name, identifiers]) => {
      const members = identifiers.map(memberOf);
      return [
        name,
        members.includes(undefined) ? undefined : [...new Set(members)].toSorted(byText),
      ];
    }),
  );
}

export function referencePositions(sourceFile: TypeScript.SourceFile): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  for (const node of fileNodes(sourceFile).filter(ts.isIdentifier).filter(isReference)) {
    positions.set(node.text, [...(positions.get(node.text) ?? []), node.getStart(sourceFile)]);
  }
  return positions;
}

export function jsxTagNames(sourceFile: TypeScript.SourceFile): Set<string> {
  return new Set(
    fileNodes(sourceFile)
      .filter((node) => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      .map(({ tagName }) => tagName.getText(sourceFile)),
  );
}
