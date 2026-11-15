import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { constantInitializer, type SourceCode } from '../../typed/node-views.mts';
import { initializerOf, isUnresolved, libraryBinding, variableOf } from './library-bindings.mts';
import { propertyName, SCHEMA_LIBRARIES } from './library-nodes.mts';

type Wrapper = TSESTree.TSAsExpression | TSESTree.TSSatisfiesExpression | TSESTree.TSTypeAssertion;
export type Finding = {
  readonly kind: 'loose' | 'field';
  readonly node: TSESTree.Node;
  readonly text: string;
};
type Entry = {
  readonly key: string;
  readonly value: TSESTree.Node;
  readonly property: TSESTree.Property;
};

const AJV_PACKAGES = SCHEMA_LIBRARIES.find(({ id }) => id === 'ajv')?.packages ?? [];
const SCHEMA_METHODS = new Set<string | undefined>([
  'compile',
  'compileAsync',
  'validate',
  'addSchema',
  'compileParser',
]);
const AJV_NAME = /ajv/i;
const SCHEMA_LISTS = new Set<string>(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
const SCHEMA_MAPS = new Set<string>(['$defs', 'definitions']);
const MAX_DEPTH = 8;
const ADDITIONAL_PROPERTIES = 'additionalProperties';

function isWrapper(node: TSESTree.Node): node is Wrapper {
  return (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  );
}

function unwrapped(node: TSESTree.Node): TSESTree.Node {
  const chain = [node];
  for (const current of chain) {
    if (isWrapper(current)) {
      chain.push(current.expression);
    }
  }
  return chain.at(-1) ?? node;
}

function isAjvConstructor(sourceCode: SourceCode, node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.NewExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    libraryBinding(variableOf(sourceCode, node.callee), AJV_PACKAGES) !== undefined
  );
}

function isAjvInstance(sourceCode: SourceCode, receiver: TSESTree.Node): boolean {
  if (isAjvConstructor(sourceCode, unwrapped(receiver))) {
    return true;
  }
  if (receiver.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  const variable = variableOf(sourceCode, receiver);
  const init = initializerOf(variable);
  return init === undefined
    ? isUnresolved(variable) && AJV_NAME.test(receiver.name)
    : isAjvConstructor(sourceCode, unwrapped(init));
}

export function ajvSchemaArgument(
  sourceCode: SourceCode,
  call: TSESTree.CallExpression,
): TSESTree.ObjectExpression | undefined {
  const { callee } = call;
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    !SCHEMA_METHODS.has(propertyName(callee)) ||
    !isAjvInstance(sourceCode, callee.object)
  ) {
    return undefined;
  }
  return literalSchema(sourceCode, call.arguments[0]);
}

function literalSchema(
  sourceCode: SourceCode,
  node: TSESTree.Node | undefined,
): TSESTree.ObjectExpression | undefined {
  const chain: TSESTree.Node[] = node === undefined ? [] : [unwrapped(node)];
  for (const current of chain) {
    const init =
      current.type === AST_NODE_TYPES.Identifier
        ? constantInitializer(sourceCode, current)
        : undefined;
    if (init !== undefined && chain.length <= MAX_DEPTH) {
      chain.push(unwrapped(init));
    }
  }
  const last = chain.at(-1);
  return last?.type === AST_NODE_TYPES.ObjectExpression ? last : undefined;
}

function keyOf(property: TSESTree.PropertyNonComputedName): string {
  return property.key.type === AST_NODE_TYPES.Identifier
    ? property.key.name
    : String(property.key.value);
}

function entries(object: TSESTree.ObjectExpression): Entry[] {
  return object.properties.flatMap((property) =>
    property.type === AST_NODE_TYPES.Property && !property.computed
      ? [{ key: keyOf(property), value: unwrapped(property.value), property }]
      : [],
  );
}

function anySchemaText(node: TSESTree.Node): string {
  return node.type === AST_NODE_TYPES.Literal ? 'The JSON Schema true' : 'An empty JSON Schema {}';
}

function looseText(key: string, value: TSESTree.Node): string {
  return key === ADDITIONAL_PROPERTIES
    ? `additionalProperties: ${value.type === AST_NODE_TYPES.Literal ? 'true' : '{}'}`
    : 'A patternProperties entry of {} or true';
}

function isAnySchema(node: TSESTree.Node): boolean {
  return (
    (node.type === AST_NODE_TYPES.Literal && node.value === true) ||
    (node.type === AST_NODE_TYPES.ObjectExpression && node.properties.length === 0)
  );
}

function objectValues(node: TSESTree.Node): TSESTree.Node[] {
  return node.type === AST_NODE_TYPES.ObjectExpression
    ? entries(node).map(({ value }) => value)
    : [];
}

function childSchemas(key: string, value: TSESTree.Node): TSESTree.Node[] {
  if (key === 'items' || key === ADDITIONAL_PROPERTIES) {
    return [value];
  }
  if (SCHEMA_LISTS.has(key) && value.type === AST_NODE_TYPES.ArrayExpression) {
    return value.elements.filter((element) => element !== null).map(unwrapped);
  }
  return SCHEMA_MAPS.has(key) || key === 'patternProperties' ? objectValues(value) : [];
}

function looseFinding({ key, value, property }: Entry): Finding[] {
  const isLoose =
    (key === ADDITIONAL_PROPERTIES && isAnySchema(value)) ||
    (key === 'patternProperties' && objectValues(value).some((pattern) => isAnySchema(pattern)));
  return isLoose ? [{ kind: 'loose', node: property, text: looseText(key, value) }] : [];
}

function fieldFindings({ key, value }: Entry): Finding[] {
  if (key !== 'properties' || value.type !== AST_NODE_TYPES.ObjectExpression) {
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

function schemaFindings(schema: TSESTree.ObjectExpression): Finding[] {
  return entries(schema).flatMap((entry) => [...looseFinding(entry), ...fieldFindings(entry)]);
}

export function jsonSchemaFindings(root: TSESTree.Node): Finding[] {
  const findings: Finding[] = [];
  const pending = [{ schema: root, depth: 0 }];
  for (const { schema, depth } of pending) {
    if (schema.type !== AST_NODE_TYPES.ObjectExpression || depth > MAX_DEPTH) {
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
