import { ts } from '../../../typescript-api/typescript-api.mjs';
import { descendants, isAssignmentOperator, isStep, unwrap } from '../syntax/nodes.mjs';

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array', 'Object']);
const FACTORIES = new Set(['Array.from', 'Object.create', 'Object.fromEntries']);
const READONLY_REFERENCES = new Set(['ReadonlyArray', 'ReadonlyMap', 'ReadonlySet', 'Readonly']);

function isConstAssertion(node) {
  return (
    ts.isAsExpression(node) &&
    ts.isTypeReferenceNode(node.type) &&
    node.type.typeName.getText() === 'const'
  );
}

function isFreshCollection(node) {
  if (ts.isNewExpression(node)) {
    return ts.isIdentifier(node.expression) && COLLECTIONS.has(node.expression.text);
  }
  return ts.isCallExpression(node) && FACTORIES.has(node.expression.getText());
}

export function isMutableValue(node) {
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

export function isReadonlyTypeNode(typeNode) {
  if (typeNode === undefined) {
    return false;
  }
  if (ts.isTypeOperatorNode(typeNode)) {
    return typeNode.operator === ts.SyntaxKind.ReadonlyKeyword;
  }
  return ts.isTypeReferenceNode(typeNode) && READONLY_REFERENCES.has(typeNode.typeName.getText());
}

function thisMemberName(left) {
  const isThisAccess =
    ts.isPropertyAccessExpression(left) && left.expression.kind === ts.SyntaxKind.ThisKeyword;
  return isThisAccess ? left.name.text : undefined;
}

export function assignedValues(classNode) {
  const values = new Map();
  for (const node of descendants(classNode)) {
    const initialized = ts.isPropertyDeclaration(node) && node.initializer !== undefined;
    const assigned =
      ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken)
        ? thisMemberName(node.left)
        : undefined;
    const name = initialized ? node.name.getText() : assigned;
    if (name !== undefined) {
      values.set(name, [...(values.get(name) ?? []), initialized ? node.initializer : node.right]);
    }
  }
  return values;
}

export function assignedNames(sourceFile) {
  const names = new Set();
  for (const node of descendants(sourceFile)) {
    const target = ts.isBinaryExpression(node) && isAssignmentOperator(node.operatorToken);
    if (target && ts.isIdentifier(node.left)) {
      names.add(node.left.text);
    }
    if (isStep(node) && ts.isIdentifier(node.operand)) {
      names.add(node.operand.text);
    }
  }
  return names;
}
