import type TypeScript from 'typescript';
import { ts } from '../syntax/typed.mts';
import { descendants, isAssignmentOperator, isStep, unwrap } from '../syntax/nodes.mts';

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array', 'Object']);
const FACTORIES = new Set(['Array.from', 'Object.create', 'Object.fromEntries']);
const READONLY_REFERENCES = new Set(['ReadonlyArray', 'ReadonlyMap', 'ReadonlySet', 'Readonly']);

function isConstAssertion(node: TypeScript.Node): boolean {
  return (
    ts.isAsExpression(node) &&
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === 'const'
  );
}

function isFreshCollection(node: TypeScript.Node): boolean {
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression) && COLLECTIONS.has(node.expression.text);
  }
  return ts.isCallExpression(node) && FACTORIES.has(node.expression.getText());
}

export function isMutableValue(node: TypeScript.Node | undefined): boolean {
  if (node === undefined || isConstAssertion(node)) {
    return false;
  }
  const value = unwrap(node);
  if (ts.isArrayLiteralExpression(value)) {
    return !value.elements.some(ts.isSpreadElement);
  }
  if (ts.isObjectLiteralExpression(value)) {
    return !value.properties.some(ts.isSpreadAssignment);
  }
  return isFreshCollection(value);
}

export function isReadonlyTypeNode(typeNode: TypeScript.TypeNode | undefined): boolean {
  if (typeNode === undefined) {
    return false;
  }
  if (ts.isTypeOperatorNode(typeNode)) {
    return typeNode.operator === ts.SyntaxKind.ReadonlyKeyword;
  }
  return ts.isTypeReferenceNode(typeNode) && READONLY_REFERENCES.has(typeNode.typeName.getText());
}

function thisMemberName(left: TypeScript.Node): string | undefined {
  const isThisAccess =
    ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword;
  return isThisAccess ? left.name.text : undefined;
}

export function assignedValues(
  classNode: TypeScript.ClassDeclaration,
): Map<string, TypeScript.Expression[]> {
  const values = new Map<string, TypeScript.Expression[]>();
  for (const node of descendants(classNode)) {
    const initializer = ts.isPropertyDeclaration(node) ? node.initializer : undefined;
    const assigned =
      ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken)
        ? thisMemberName(node.left)
        : undefined;
    const name =
      initializer !== undefined && ts.isPropertyDeclaration(node) ? node.name.getText() : assigned;
    const value = initializer ?? (ts.isBinaryExpression(node) ? node.right : undefined);
    if (name !== undefined && value !== undefined) {
      values.set(name, [...(values.get(name) ?? []), value]);
    }
  }
  return values;
}

export function assignedNames(sourceFile: TypeScript.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const node of descendants(sourceFile)) {
    if (
      ts.isBinaryExpression(node) &&
      isAssignmentOperator(node.operatorToken) &&
      ts.isIdentifier(node.left)
    ) {
      names.add(node.left.text);
    }
    if (isStep(node) && ts.isIdentifier(node.operand)) {
      names.add(node.operand.text);
    }
  }
  return names;
}
