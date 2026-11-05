import { staticKeyName } from '../analysis/static-shapes.mjs';
import { SEQUELIZE, importedName, importsOrm, objectOf, propertiesOf } from './orm-bindings.mjs';

const DEFAULT_SCOPE = 'defaultScope';
const SCOPE_DECORATOR = 'DefaultScope';
const ADD_SCOPE = 'addScope';

const FUNCTION_TYPES = new Set([
  'ArrowFunctionExpression',
  'FunctionExpression',
  'FunctionDeclaration',
]);

function childNodes(node) {
  return Object.entries(node)
    .filter(([key]) => key !== 'parent')
    .flatMap(([, value]) => (Array.isArray(value) ? value : [value]))
    .filter((child) => typeof child?.type === 'string' && !FUNCTION_TYPES.has(child.type));
}

function returnedValues(body) {
  const pending = [body];
  const returned = [];
  for (const node of pending) {
    if (node.type === 'ReturnStatement') {
      returned.push(node.argument);
    } else {
      pending.push(...childNodes(node));
    }
  }
  return returned;
}

function returnedObjects(sourceCode, scope) {
  if (!FUNCTION_TYPES.has(scope?.type)) {
    return [objectOf(sourceCode, scope)];
  }
  if (scope.body.type !== 'BlockStatement') {
    return [objectOf(sourceCode, scope.body)];
  }
  return returnedValues(scope.body).map((value) => objectOf(sourceCode, value ?? undefined));
}

function includesAssociations(include) {
  const value = include.value;
  if (value.type === 'Identifier') {
    return value.name !== 'undefined';
  }
  return value.type !== 'ArrayExpression' || value.elements.length > 0;
}

export function eagerInclude(sourceCode, scope) {
  return returnedObjects(sourceCode, scope)
    .map((object) => propertiesOf(sourceCode, object).get('include'))
    .find((include) => include !== undefined && includesAssociations(include));
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
