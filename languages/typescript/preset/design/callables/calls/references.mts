import type TypeScript from 'typescript';
import { fieldOf } from '../../../../../../shared/values/readers.mts';
import { ts, chainOf } from '../../syntax/typed.mts';
import { wrappedFunction } from '../../syntax/function-values.mts';
import { isAssignmentOperator, isWrapper, outsideClosures } from '../../syntax/nodes.mts';
import { symbolOf } from '../scope.mts';
import { targetSite, valueSite } from './targets.mts';
import type { Scope, Site, State } from '../../design-types.mts';

type Node = TypeScript.Node;

const BINDING_METHODS = new Set(['call', 'apply', 'bind']);
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
]);

function isNamePosition(node: Node): boolean {
  const { parent } = node;
  if (ts.isShorthandPropertyAssignment(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) {
    return (
      (ts.isPropertyAccessExpression(parent) && parent.name === node) || ts.isQualifiedName(parent)
    );
  }
  return (
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    fieldOf(parent, 'name') === node
  );
}

function outermost(node: Node): Node {
  return (
    chainOf(node, (current) =>
      isWrapper(current.parent) && current.parent.expression === current
        ? current.parent
        : undefined,
    ).at(-1) ?? node
  );
}

function isCalled(parent: Node, value: Node): boolean {
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isDecorator(parent)) &&
      parent.expression === value) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === value)
  );
}

function isOperand(parent: Node, value: Node): boolean {
  if (ts.isBinaryExpression(parent)) {
    const kind = parent.operatorToken.kind;
    return (
      COMPARISONS.has(kind) || (parent.left === value && isAssignmentOperator(parent.operatorToken))
    );
  }
  return ts.isTypeOfExpression(parent) || ts.isDeleteExpression(parent);
}

function isValueUse(node: Node): boolean {
  if (ts.isIdentifier(node) && isNamePosition(node)) {
    return false;
  }
  const value = outermost(node);
  const { parent } = value;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === value) {
    return BINDING_METHODS.has(parent.name.text);
  }
  if (ts.isElementAccessExpression(parent) && parent.expression === value) {
    return false;
  }
  return !(isCalled(parent, value) || isOperand(parent, value));
}

function isCandidate(
  node: Node,
): node is TypeScript.Identifier | TypeScript.PropertyAccessExpression {
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node);
}

function valueReferences(scope: State, nodes: readonly Node[]): Site[] {
  return nodes
    .filter(
      (node): node is TypeScript.Identifier | TypeScript.PropertyAccessExpression =>
        isCandidate(node) && isValueUse(node),
    )
    .map((node) => valueSite(scope, node))
    .filter((site) => site !== undefined);
}

function isModuleConstant(
  { registry }: Pick<State, 'registry'>,
  declaration: Node | undefined,
): declaration is TypeScript.VariableDeclaration {
  if (declaration === undefined || !ts.isVariableDeclaration(declaration)) {
    return false;
  }
  const list = declaration.parent;
  return (
    (list.flags & ts.NodeFlags.Const) !== 0 &&
    ts.isVariableStatement(list.parent) &&
    ts.isSourceFile(list.parent.parent) &&
    registry.owned.has(list.parent.parent.fileName) &&
    declaration.initializer !== undefined &&
    wrappedFunction(declaration.initializer) === undefined
  );
}

function constantReferences(scope: State, declaration: Node): Site[] {
  const { heldByConstant } = scope.registry;
  const known = heldByConstant.get(declaration);
  if (known !== undefined) {
    return known;
  }
  const references = valueReferences(scope, outsideClosures(declaration));
  heldByConstant.set(declaration, references);
  return references;
}

function heldReferences(scope: State, nodes: readonly Node[]): Site[] {
  return nodes
    .filter(
      (node): node is TypeScript.Identifier =>
        ts.isIdentifier(node) && scope.registry.constantNames.has(node.text),
    )
    .filter((node) => !isNamePosition(node))
    .map((node) => symbolOf(scope, node)?.valueDeclaration)
    .filter((declaration) => isModuleConstant(scope, declaration))
    .flatMap((declaration) => constantReferences(scope, declaration));
}

function uniqueIds(sites: readonly Site[], ownId: string | undefined): string[] {
  return [...new Set(sites.map(({ id }) => id))].filter((id) => id !== ownId);
}

export function constantNamesOf(sourceFile: TypeScript.SourceFile): string[] {
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .map(({ declarationList }) => declarationList)
    .filter((list) => (list.flags & ts.NodeFlags.Const) !== 0)
    .flatMap(({ declarations }) => declarations)
    .flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
}

export function referenceFacts(scope: Scope): string[] {
  const sites = [...valueReferences(scope, scope.nodes), ...heldReferences(scope, scope.nodes)];
  return uniqueIds(sites, scope.site.id);
}

export function moduleReferences(state: State, sourceFile: TypeScript.SourceFile): string[] {
  const nodes = outsideClosures(sourceFile);
  const called = nodes
    .filter(
      (node): node is TypeScript.CallExpression | TypeScript.NewExpression =>
        ts.isCallExpression(node) || ts.isNewExpression(node),
    )
    .map((node) => targetSite(state, node))
    .filter((site) => site !== undefined);
  return uniqueIds([...called, ...valueReferences(state, nodes)], undefined);
}
