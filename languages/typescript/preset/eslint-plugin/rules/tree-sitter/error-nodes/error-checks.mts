import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { nameOf, nodeChildren, nodesWithoutNested } from '../../typed/node-views.mts';
import { calleeNameOf, unwrapped } from '../../typed/syntax-views.mts';

const ERROR_PROPERTIES = new Set(['hasError', 'isError', 'isMissing']);
const ERROR_TYPE_NAMES = new Set(['ERROR', 'MISSING']);
const EQUALITY_OPERATORS = new Set(['===', '!==', '==', '!=']);
const TYPE_IDENTIFIERS = new Set(['type', 'nodeType', 'kind']);
const NESTED_DECLARATIONS = new Set<string>([AST_NODE_TYPES.FunctionDeclaration]);

function isErrorTypeLiteral(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  return (
    plain.type === AST_NODE_TYPES.Literal &&
    typeof plain.value === 'string' &&
    ERROR_TYPE_NAMES.has(plain.value)
  );
}

function isTypeExpression(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  if (plain.type === AST_NODE_TYPES.MemberExpression && !plain.computed) {
    return nameOf(plain.property) === 'type';
  }
  const identifier = nameOf(plain);
  return identifier !== undefined && TYPE_IDENTIFIERS.has(identifier);
}

function isErrorPropertyAccess(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  const property = nameOf(node.property);
  return property !== undefined && ERROR_PROPERTIES.has(property);
}

function isErrorDestructuring(node: TSESTree.Node): boolean {
  if (
    node.type !== AST_NODE_TYPES.Property ||
    node.computed ||
    node.parent.type !== AST_NODE_TYPES.ObjectPattern
  ) {
    return false;
  }
  const key = nameOf(node.key);
  return key !== undefined && ERROR_PROPERTIES.has(key);
}

function isErrorTypeComparison(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.BinaryExpression || !EQUALITY_OPERATORS.has(node.operator)) {
    return false;
  }
  return (
    (isTypeExpression(node.left) && isErrorTypeLiteral(node.right)) ||
    (isErrorTypeLiteral(node.left) && isTypeExpression(node.right))
  );
}

function isErrorTypeSwitch(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.SwitchStatement || !isTypeExpression(node.discriminant)) {
    return false;
  }
  return node.cases.some((item) => item.test !== null && isErrorTypeLiteral(item.test));
}

function arrayContainsErrorType(node: TSESTree.Node): boolean {
  const plain = unwrapped(node);
  if (plain.type !== AST_NODE_TYPES.ArrayExpression) {
    return false;
  }
  return plain.elements.some((element) => element !== null && isErrorTypeLiteral(element));
}

function isErrorTypeMembership(node: TSESTree.Node): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const method = calleeNameOf(node.callee);
  const [first] = node.arguments;
  if (
    (method !== 'includes' && method !== 'has') ||
    first === undefined ||
    !isTypeExpression(first) ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return false;
  }
  const receiver = unwrapped(node.callee.object);
  if (arrayContainsErrorType(receiver)) {
    return true;
  }
  return (
    receiver.type === AST_NODE_TYPES.NewExpression &&
    nameOf(receiver.callee) === 'Set' &&
    receiver.arguments[0] !== undefined &&
    arrayContainsErrorType(receiver.arguments[0])
  );
}

function isErrorCheckNode(node: TSESTree.Node): boolean {
  return (
    isErrorPropertyAccess(node) ||
    isErrorDestructuring(node) ||
    isErrorTypeComparison(node) ||
    isErrorTypeSwitch(node) ||
    isErrorTypeMembership(node)
  );
}

export function hasErrorCheck(root: TSESTree.Node): boolean {
  return nodesWithoutNested(root, NESTED_DECLARATIONS, nodeChildren).some(isErrorCheckNode);
}
