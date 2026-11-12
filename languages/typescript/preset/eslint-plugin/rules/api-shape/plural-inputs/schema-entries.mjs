import { staticKeyName } from '../../analysis/static-shapes.mjs';

const SCHEMA_MODULE = /^(?:zod|valibot|superstruct|@sinclair\/typebox|typebox)(?:\/|$)/u;
const OBJECT_FACTORIES = new Set(['object', 'strictObject', 'looseObject', 'Object', 'type']);
const OPTIONAL_WRAPPERS = new Set(['optional', 'nullish', 'exactOptional', 'Optional']);
const OPTIONAL_METHODS = new Set(['optional', 'nullish', 'default']);
const TRANSPARENT_METHODS = new Set(['describe', 'meta', 'readonly']);
const ARRAY_FACTORIES = new Set(['array', 'Array']);
const ARRAY_CHECKS = new Set(['min', 'max', 'length', 'nonempty']);
const PIPE = 'pipe';

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  const isNamed = callee.type === 'MemberExpression' && !callee.computed;
  return isNamed && callee.property.type === 'Identifier' ? callee.property.name : undefined;
}

function importedFromSchemaModule(sourceCode, identifier) {
  const variable = sourceCode
    .getScope(identifier)
    .references.find((reference) => reference.identifier === identifier)?.resolved;
  return (
    variable?.defs.some(
      ({ type, parent }) =>
        type === 'ImportBinding' &&
        typeof parent.source.value === 'string' &&
        SCHEMA_MODULE.test(parent.source.value),
    ) ?? false
  );
}

function libraryCallName(sourceCode, node) {
  if (node.type !== 'CallExpression') {
    return undefined;
  }
  const { callee } = node;
  const root = callee.type === 'MemberExpression' ? callee.object : callee;
  const isLibrary = root.type === 'Identifier' && importedFromSchemaModule(sourceCode, root);
  return isLibrary ? calleeName(callee) : undefined;
}

function methodCallName(sourceCode, node) {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') {
    return undefined;
  }
  return libraryCallName(sourceCode, node) === undefined ? calleeName(node.callee) : undefined;
}

function innerSchema(sourceCode, node) {
  const method = methodCallName(sourceCode, node);
  if (OPTIONAL_METHODS.has(method) || TRANSPARENT_METHODS.has(method)) {
    return { inner: node.callee.object, optional: OPTIONAL_METHODS.has(method) };
  }
  const library = libraryCallName(sourceCode, node);
  const unwraps = OPTIONAL_WRAPPERS.has(library) || library === PIPE;
  return unwraps && node.arguments.length > 0
    ? { inner: node.arguments[0], optional: OPTIONAL_WRAPPERS.has(library) }
    : undefined;
}

function unwrapped(sourceCode, schema) {
  const steps = [{ inner: schema, optional: false }];
  for (const step of steps) {
    const next = innerSchema(sourceCode, step.inner);
    if (next !== undefined) {
      steps.push(next);
    }
  }
  return { node: steps.at(-1).inner, optional: steps.some((step) => step.optional) };
}

function withoutArrayChecks(sourceCode, schema) {
  const pending = [schema];
  for (const node of pending) {
    if (ARRAY_CHECKS.has(methodCallName(sourceCode, node))) {
      pending.push(node.callee.object);
    }
  }
  return pending.at(-1);
}

function elementOf(sourceCode, schema) {
  const node = withoutArrayChecks(sourceCode, schema);
  if (ARRAY_FACTORIES.has(libraryCallName(sourceCode, node)) && node.arguments.length === 1) {
    return unwrapped(sourceCode, node.arguments[0]);
  }
  const isArrayMethod = methodCallName(sourceCode, node) === 'array' && node.arguments.length === 0;
  return isArrayMethod ? unwrapped(sourceCode, node.callee.object) : undefined;
}

function entryInput(sourceCode, property) {
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

export function schemaEntryInputs(sourceCode, call) {
  const [shape] = call.arguments;
  const isObjectSchema =
    shape?.type === 'ObjectExpression' &&
    OBJECT_FACTORIES.has(calleeName(call.callee)) &&
    OBJECT_FACTORIES.has(libraryCallName(sourceCode, call));
  const inputs = new Map();
  for (const property of isObjectSchema ? shape.properties : []) {
    const name =
      property.type === 'Property' ? staticKeyName(property.key, property.computed) : undefined;
    const input = name === undefined ? undefined : entryInput(sourceCode, property);
    if (input !== undefined) {
      inputs.set(name, input);
    }
  }
  return inputs;
}
