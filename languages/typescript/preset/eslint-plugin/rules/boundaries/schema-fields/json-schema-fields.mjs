import { constantInitializer } from '../../analysis/ancestry.mjs';
import {
  initializer,
  isUnresolved,
  libraryBinding,
  variableOf,
} from '../../../../libraries/module-bindings.mjs';
import { propertyName, SCHEMA_LIBRARIES } from './library-nodes.mjs';

const AJV = SCHEMA_LIBRARIES.find(({ id }) => id === 'ajv');
const SCHEMA_METHODS = new Set([
  'compile',
  'compileAsync',
  'validate',
  'addSchema',
  'compileParser',
]);
const AJV_NAME = /ajv/i;
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion']);
const SCHEMA_LISTS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_MAPS = new Set(['$defs', 'definitions']);
const MAX_DEPTH = 8;

function unwrapped(node) {
  const chain = [node];
  for (const current of chain) {
    if (WRAPPERS.has(current.type)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1);
}

function isAjvConstructor(sourceCode, node) {
  return (
    node?.type === 'NewExpression' &&
    node.callee.type === 'Identifier' &&
    libraryBinding(variableOf(sourceCode, node.callee), AJV.packages) !== undefined
  );
}

function isAjvInstance(sourceCode, receiver) {
  if (isAjvConstructor(sourceCode, unwrapped(receiver))) {
    return true;
  }
  if (receiver.type !== 'Identifier') {
    return false;
  }
  const variable = variableOf(sourceCode, receiver);
  const init = initializer(variable);
  return init === undefined || init === null
    ? isUnresolved(variable) && AJV_NAME.test(receiver.name)
    : isAjvConstructor(sourceCode, unwrapped(init));
}

export function ajvSchemaArgument(sourceCode, call) {
  const { callee } = call;
  if (
    callee.type !== 'MemberExpression' ||
    !SCHEMA_METHODS.has(propertyName(callee)) ||
    !isAjvInstance(sourceCode, callee.object)
  ) {
    return undefined;
  }
  return literalSchema(sourceCode, call.arguments[0]);
}

function literalSchema(sourceCode, node) {
  const chain = node === undefined ? [] : [unwrapped(node)];
  for (const current of chain) {
    const init =
      current.type === 'Identifier' ? constantInitializer(sourceCode, current) : undefined;
    if (init !== undefined && chain.length <= MAX_DEPTH) {
      chain.push(unwrapped(init));
    }
  }
  const last = chain.at(-1);
  return last?.type === 'ObjectExpression' ? last : undefined;
}

function keyOf(property) {
  if (property.type !== 'Property' || property.computed) {
    return undefined;
  }
  return property.key.type === 'Identifier' ? property.key.name : property.key.value;
}

function entries(object) {
  return object.properties
    .map((property) => ({ key: keyOf(property), property }))
    .filter(({ key }) => key !== undefined)
    .map(({ key, property }) => ({ key, value: unwrapped(property.value), property }));
}

function anySchemaText(node) {
  return node.type === 'Literal' ? 'The JSON Schema true' : 'An empty JSON Schema {}';
}

function looseText(key, value) {
  return key === 'additionalProperties'
    ? `additionalProperties: ${value.type === 'Literal' ? 'true' : '{}'}`
    : 'A patternProperties entry of {} or true';
}

function isAnySchema(node) {
  return (
    (node.type === 'Literal' && node.value === true) ||
    (node.type === 'ObjectExpression' && node.properties.length === 0)
  );
}

function objectValues(node) {
  return node.type === 'ObjectExpression' ? entries(node).map(({ value }) => value) : [];
}

function childSchemas(key, value) {
  if (key === 'items' || key === 'additionalProperties') {
    return [value];
  }
  if (SCHEMA_LISTS.has(key) && value.type === 'ArrayExpression') {
    return value.elements.filter((element) => element !== null).map(unwrapped);
  }
  return SCHEMA_MAPS.has(key) || key === 'patternProperties' ? objectValues(value) : [];
}

function looseFinding({ key, value, property }) {
  const isLoose =
    (key === 'additionalProperties' && isAnySchema(value)) ||
    (key === 'patternProperties' && objectValues(value).some((pattern) => isAnySchema(pattern)));
  return isLoose ? [{ kind: 'loose', node: property, text: looseText(key, value) }] : [];
}

function fieldFindings({ key, value }) {
  if (key !== 'properties' || value.type !== 'ObjectExpression') {
    return [];
  }
  return entries(value)
    .filter((field) => isAnySchema(field.value))
    .map((field) => ({
      kind: 'field',
      node: field.property.value,
      text: anySchemaText(field.value),
    }));
}

function schemaFindings(schema) {
  return entries(schema).flatMap((entry) => [...looseFinding(entry), ...fieldFindings(entry)]);
}

export function jsonSchemaFindings(root) {
  const findings = [];
  const pending = [{ schema: root, depth: 0 }];
  for (const { schema, depth } of pending) {
    if (schema.type !== 'ObjectExpression' || depth > MAX_DEPTH) {
      continue;
    }
    findings.push(...schemaFindings(schema));
    for (const { key, value } of entries(schema)) {
      const children = key === 'properties' ? objectValues(value) : childSchemas(key, value);
      pending.push(...children.map((child) => ({ schema: child, depth: depth + 1 })));
    }
  }
  return findings;
}
