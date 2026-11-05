import { staticKeyName } from '../analysis/static-shapes.mjs';
import { SEQUELIZE, importedName, importsOrm, objectOf, propertiesOf } from './orm-bindings.mjs';

const DEFAULT_SCOPE = 'defaultScope';
const SCOPE_DECORATOR = 'DefaultScope';
const ADD_SCOPE = 'addScope';

function returnedObject(sourceCode, scope) {
  if (scope?.type !== 'ArrowFunctionExpression' && scope?.type !== 'FunctionExpression') {
    return objectOf(sourceCode, scope);
  }
  if (scope.body.type !== 'BlockStatement') {
    return objectOf(sourceCode, scope.body);
  }
  const returned = scope.body.body.findLast((statement) => statement.type === 'ReturnStatement');
  return objectOf(sourceCode, returned?.argument ?? undefined);
}

function includesAssociations(include) {
  return include.value.type !== 'ArrayExpression' || include.value.elements.length > 0;
}

export function eagerInclude(sourceCode, scope) {
  const include = propertiesOf(sourceCode, returnedObject(sourceCode, scope)).get('include');
  return include !== undefined && includesAssociations(include) ? include : undefined;
}

function isDefaultScopeCall(call) {
  const [name] = call.arguments;
  return (
    call.callee.type === 'MemberExpression' &&
    staticKeyName(call.callee.property, call.callee.computed) === ADD_SCOPE &&
    name?.type === 'Literal' &&
    name.value === DEFAULT_SCOPE
  );
}

export function defaultScopeOf(sourceCode, node) {
  if (!importsOrm(sourceCode, SEQUELIZE)) {
    return undefined;
  }
  if (node.type === 'Property') {
    return staticKeyName(node.key, node.computed) === DEFAULT_SCOPE ? node.value : undefined;
  }
  if (isDefaultScopeCall(node)) {
    return node.arguments[1];
  }
  return importedName(sourceCode, node.callee, SEQUELIZE) === SCOPE_DECORATOR
    ? node.arguments[0]
    : undefined;
}
