import { AST_NODE_TYPES, TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { staticKeyName } from '../../analysis/static-shapes.mts';
import type { SourceCode } from '../../typed/node-views.mts';
import type { Input, InputSet } from './type-members.mts';

type Schema = { readonly inner: TSESTree.Node; readonly optional: boolean };

const SCHEMA_MODULE = /^(?:zod|valibot|superstruct|@sinclair\/typebox|typebox)(?:\/|$)/u;
const OBJECT_FACTORIES = new Set<string | undefined>([
  'object',
  'strictObject',
  'looseObject',
  'Object',
  'type',
]);
const OPTIONAL_WRAPPERS = new Set<string | undefined>([
  'optional',
  'nullish',
  'exactOptional',
  'Optional',
]);
const OPTIONAL_METHODS = new Set<string | undefined>(['optional', 'nullish', 'default']);
const TRANSPARENT_METHODS = new Set<string | undefined>(['describe', 'meta', 'readonly']);
const ARRAY_FACTORIES = new Set<string | undefined>(['array', 'Array']);
const ARRAY_CHECKS = new Set<string | undefined>(['min', 'max', 'length', 'nonempty']);
const PIPE = 'pipe';

function calleeName(callee: TSESTree.Node): string | undefined {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name;
  }
  const isNamed = callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed;
  return isNamed && callee.property.type === AST_NODE_TYPES.Identifier
    ? callee.property.name
    : undefined;
}

function importedFromSchemaModule(
  sourceCode: SourceCode,
  identifier: TSESTree.Identifier,
): boolean {
  const variable = sourceCode
    .getScope(identifier)
    .references.find((reference) => reference.identifier === identifier)?.resolved;
  return (
    variable?.defs.some(
      ({ type, parent }) =>
        type === TSESLint.Scope.DefinitionType.ImportBinding &&
        parent.type === AST_NODE_TYPES.ImportDeclaration &&
        typeof parent.source.value === 'string' &&
        SCHEMA_MODULE.test(parent.source.value),
    ) ?? false
  );
}

function libraryCallName(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const { callee } = node;
  const root = callee.type === AST_NODE_TYPES.MemberExpression ? callee.object : callee;
  const isLibrary =
    root.type === AST_NODE_TYPES.Identifier && importedFromSchemaModule(sourceCode, root);
  return isLibrary ? calleeName(callee) : undefined;
}

function methodCallName(sourceCode: SourceCode, node: TSESTree.Node): string | undefined {
  if (
    node.type !== AST_NODE_TYPES.CallExpression ||
    node.callee.type !== AST_NODE_TYPES.MemberExpression
  ) {
    return undefined;
  }
  return libraryCallName(sourceCode, node) === undefined ? calleeName(node.callee) : undefined;
}

function innerSchema(sourceCode: SourceCode, node: TSESTree.Node): Schema | undefined {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const method = methodCallName(sourceCode, node);
  if (
    (OPTIONAL_METHODS.has(method) || TRANSPARENT_METHODS.has(method)) &&
    node.callee.type === AST_NODE_TYPES.MemberExpression
  ) {
    return { inner: node.callee.object, optional: OPTIONAL_METHODS.has(method) };
  }
  const library = libraryCallName(sourceCode, node);
  const unwraps = OPTIONAL_WRAPPERS.has(library) || library === PIPE;
  const [first] = node.arguments;
  return unwraps && first !== undefined
    ? { inner: first, optional: OPTIONAL_WRAPPERS.has(library) }
    : undefined;
}

function unwrapped(
  sourceCode: SourceCode,
  schema: TSESTree.Node,
): { readonly node: TSESTree.Node; readonly optional: boolean } {
  const steps: Schema[] = [{ inner: schema, optional: false }];
  for (const step of steps) {
    const next = innerSchema(sourceCode, step.inner);
    if (next !== undefined) {
      steps.push(next);
    }
  }
  return { node: steps.at(-1)?.inner ?? schema, optional: steps.some((step) => step.optional) };
}

function withoutArrayChecks(sourceCode: SourceCode, schema: TSESTree.Node): TSESTree.Node {
  const pending = [schema];
  for (const node of pending) {
    if (
      ARRAY_CHECKS.has(methodCallName(sourceCode, node)) &&
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression
    ) {
      pending.push(node.callee.object);
    }
  }
  return pending.at(-1) ?? schema;
}

function elementOf(
  sourceCode: SourceCode,
  schema: TSESTree.Node,
): { readonly node: TSESTree.Node; readonly optional: boolean } | undefined {
  const node = withoutArrayChecks(sourceCode, schema);
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }
  const [first] = node.arguments;
  if (
    first !== undefined &&
    ARRAY_FACTORIES.has(libraryCallName(sourceCode, node)) &&
    node.arguments.length === 1
  ) {
    return unwrapped(sourceCode, first);
  }
  const isArrayMethod = methodCallName(sourceCode, node) === 'array' && node.arguments.length === 0;
  return isArrayMethod && node.callee.type === AST_NODE_TYPES.MemberExpression
    ? unwrapped(sourceCode, node.callee.object)
    : undefined;
}

function entryInput(sourceCode: SourceCode, property: TSESTree.Property): Input | undefined {
  const { node, optional } = unwrapped(sourceCode, property.value);
  if (!optional) {
    return undefined;
  }
  const element = elementOf(sourceCode, node);
  const isPlainElement = element !== undefined && !element.optional;
  return {
    node: property,
    text: sourceCode.getText(node),
    element: isPlainElement ? sourceCode.getText(element.node) : undefined,
  };
}

export function schemaEntryInputs(sourceCode: SourceCode, call: TSESTree.CallExpression): InputSet {
  const [shape] = call.arguments;
  const properties =
    shape?.type === AST_NODE_TYPES.ObjectExpression &&
    OBJECT_FACTORIES.has(calleeName(call.callee)) &&
    OBJECT_FACTORIES.has(libraryCallName(sourceCode, call))
      ? shape.properties
      : [];
  const inputs: InputSet = new Map();
  for (const property of properties) {
    if (property.type !== AST_NODE_TYPES.Property) {
      continue;
    }
    const name = staticKeyName(property);
    const input = name === undefined ? undefined : entryInput(sourceCode, property);
    if (name !== undefined && input !== undefined) {
      inputs.set(name, input);
    }
  }
  return inputs;
}
