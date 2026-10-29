import ts from 'typescript';
import { wrappedFunction } from '../../syntax/function-values.mjs';
import { chainOf } from '../../../../../../shared/traversal.mjs';
import { isAssignmentOperator, isWrapper, outsideClosures } from '../../syntax/nodes.mjs';
import { symbolOf } from '../scope.mjs';
import { targetSite, valueSite } from './targets.mjs';

const BINDING_METHODS = new Set(['call', 'apply', 'bind']);
const COMPARISONS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.InstanceOfKeyword,
]);

function isNamePosition(node) {
  const { parent } = node;
  if (ts.isShorthandPropertyAssignment(parent)) {
    return false;
  }
  if (ts.isPropertyAccessExpression(parent) || ts.isQualifiedName(parent)) {
    return parent.name === node || ts.isQualifiedName(parent);
  }
  return (
    ts.isImportSpecifier(parent) ||
    ts.isExportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isLabeledStatement(parent) ||
    ts.isBreakOrContinueStatement(parent) ||
    parent.name === node
  );
}

function outermost(node) {
  return chainOf(node, (current) =>
    isWrapper(current.parent) && current.parent.expression === current ? current.parent : undefined,
  ).at(-1);
}

function isCalled(parent, value) {
  return (
    ((ts.isCallExpression(parent) || ts.isNewExpression(parent) || ts.isDecorator(parent)) &&
      parent.expression === value) ||
    (ts.isTaggedTemplateExpression(parent) && parent.tag === value)
  );
}

function isOperand(parent, value) {
  if (ts.isBinaryExpression(parent)) {
    const kind = parent.operatorToken.kind;
    return (
      COMPARISONS.has(kind) || (parent.left === value && isAssignmentOperator(parent.operatorToken))
    );
  }
  return ts.isTypeOfExpression(parent) || ts.isDeleteExpression(parent);
}

function isValueUse(node) {
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
  return !isCalled(parent, value) && !isOperand(parent, value);
}

function isCandidate(node) {
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node);
}

function valueReferences(scope, nodes) {
  return nodes
    .filter((node) => isCandidate(node) && isValueUse(node))
    .map((node) => valueSite(scope, node))
    .filter((site) => site !== undefined);
}

function isModuleConstant({ registry }, declaration) {
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

function constantReferences(scope, declaration) {
  const { heldByConstant } = scope.registry;
  if (!heldByConstant.has(declaration)) {
    heldByConstant.set(declaration, valueReferences(scope, outsideClosures(declaration)));
  }
  return heldByConstant.get(declaration);
}

function heldReferences(scope, nodes) {
  return nodes
    .filter((node) => ts.isIdentifier(node) && scope.registry.constantNames.has(node.text))
    .filter((node) => !isNamePosition(node))
    .map((node) => symbolOf(scope, node)?.valueDeclaration)
    .filter((declaration) => isModuleConstant(scope, declaration))
    .flatMap((declaration) => constantReferences(scope, declaration));
}

function uniqueIds(sites, ownId) {
  return [...new Set(sites.map(({ id }) => id))].filter((id) => id !== ownId);
}

function constantNamesOf(sourceFile) {
  return sourceFile.statements
    .filter(ts.isVariableStatement)
    .map(({ declarationList }) => declarationList)
    .filter((list) => (list.flags & ts.NodeFlags.Const) !== 0)
    .flatMap(({ declarations }) => declarations)
    .filter((declaration) => ts.isIdentifier(declaration.name))
    .map((declaration) => declaration.name.text);
}

export function indexConstants(files, registry) {
  for (const name of files.flatMap(({ sourceFile }) => constantNamesOf(sourceFile))) {
    registry.constantNames.add(name);
  }
}

export function referenceFacts(scope) {
  const sites = [...valueReferences(scope, scope.nodes), ...heldReferences(scope, scope.nodes)];
  return uniqueIds(sites, scope.site.id);
}

export function moduleReferences(state, sourceFile) {
  const nodes = outsideClosures(sourceFile);
  const called = nodes
    .filter((node) => ts.isCallExpression(node) || ts.isNewExpression(node))
    .map((node) => targetSite(state, node))
    .filter((site) => site !== undefined);
  return uniqueIds([...called, ...valueReferences(state, nodes)], undefined);
}
