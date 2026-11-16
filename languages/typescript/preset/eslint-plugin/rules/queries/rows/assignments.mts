import { isFunctionNode } from '../../analysis/constant-resolution.mts';
import { memberName, unwrapped } from '../../security/security-values.mts';
import { expandsFully } from '../../../../../../../shared/traversal.mjs';

const OPERANDS = ['left', 'right', 'test', 'consequent', 'alternate', 'argument'];

function isDateNow(node) {
  const callee = unwrapped(node.callee);
  return (
    callee.type === 'MemberExpression' &&
    unwrapped(callee.object).name === 'Date' &&
    memberName(callee) === 'now'
  );
}

function rootOf(node) {
  const pending = [unwrapped(node)];
  for (const current of pending) {
    if (current.type !== 'MemberExpression') {
      return current;
    }
    pending.push(unwrapped(current.object));
  }
  return undefined;
}

function dependentOn(element, name) {
  return name === element ? undefined : [];
}

function operandsOf(target) {
  return OPERANDS.map((key) => target[key]).filter((operand) => operand !== undefined);
}

function propertyValues(properties) {
  const plain = properties.every((each) => each.type === 'Property' && !each.computed);
  return plain ? properties.map((each) => each.value) : undefined;
}

function childrenOf(target, element) {
  switch (target?.type) {
    case 'Literal':
    case 'ThisExpression':
      return [];
    case 'Identifier':
      return dependentOn(element, target.name);
    case 'MemberExpression':
      return [rootOf(target), target.property];
    case 'NewExpression':
      return target.callee.name === 'Date' ? target.arguments : undefined;
    case 'CallExpression':
      return isDateNow(target) ? [] : undefined;
    case 'TemplateLiteral':
      return target.expressions;
    case 'ArrayExpression':
      return target.elements.some((element) => element === null) ? undefined : target.elements;
    case 'ObjectExpression':
      return propertyValues(target.properties);
    case 'UnaryExpression':
    case 'BinaryExpression':
    case 'LogicalExpression':
    case 'ConditionalExpression':
      return operandsOf(target);
    default:
      return undefined;
  }
}

function independent(node, element) {
  return expandsFully(node, (item) => childrenOf(unwrapped(item), element));
}

function isFieldAssignment(statement, element) {
  const expression = statement.type === 'ExpressionStatement' ? statement.expression : statement;
  return (
    expression.type === 'AssignmentExpression' &&
    expression.operator === '=' &&
    expression.left.type === 'MemberExpression' &&
    expression.left.object.type === 'Identifier' &&
    expression.left.object.name === element &&
    independent(expression.right, element)
  );
}

export function assignsOnly(body, element) {
  const statements = body.type === 'BlockStatement' ? body.body : [body];
  return statements.length > 0 && statements.every((each) => isFieldAssignment(each, element));
}

export function loopOf(read) {
  const parent = read.parent;
  if (parent.type === 'ForOfStatement' && parent.right === read) {
    const [declarator] = parent.left.type === 'VariableDeclaration' ? parent.left.declarations : [];
    const element = declarator?.id.type === 'Identifier' ? declarator.id.name : undefined;
    return element === undefined ? undefined : { loop: parent, element, body: parent.body };
  }
  const call = parent.parent;
  const each =
    parent.type === 'MemberExpression' &&
    parent.object === read &&
    memberName(parent) === 'forEach' &&
    call.type === 'CallExpression' &&
    call.callee === parent;
  const callback = each ? call.arguments[0] : undefined;
  const [param] = callback !== undefined && isFunctionNode(callback) ? callback.params : [];
  return param?.type === 'Identifier'
    ? { loop: call, element: param.name, body: callback.body }
    : undefined;
}
