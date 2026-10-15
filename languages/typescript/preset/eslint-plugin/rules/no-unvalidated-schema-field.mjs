const OBJECT_SCHEMA_FACTORIES = new Set(['object', 'strictObject', 'looseObject']);
const UNVALIDATED_FACTORIES = new Set(['unknown', 'any']);
const NON_VALIDATING_METHODS = new Set([
  'optional',
  'nullable',
  'nullish',
  'default',
  'prefault',
  'catch',
  'describe',
  'meta',
  'readonly',
  'brand',
]);
const ZOD_NAMES = new Set(['z', 'zod']);

function memberName(callee) {
  if (callee.type !== 'MemberExpression' || callee.computed) return undefined;
  return callee.property.type === 'Identifier' ? callee.property.name : undefined;
}

function isZod(sourceCode, identifier) {
  if (ZOD_NAMES.has(identifier.name)) return true;
  const variable = sourceCode
    .getScope(identifier)
    .references.find((reference) => reference.identifier === identifier)?.resolved;
  return (
    variable?.defs.some(
      (definition) =>
        definition.type === 'ImportBinding' &&
        typeof definition.parent.source.value === 'string' &&
        /^zod(\/|$)/.test(definition.parent.source.value),
    ) ?? false
  );
}

function isZodCall(sourceCode, node, names) {
  if (node.type !== 'CallExpression') return false;
  const name = memberName(node.callee);
  return (
    name !== undefined &&
    names.has(name) &&
    node.callee.object.type === 'Identifier' &&
    isZod(sourceCode, node.callee.object)
  );
}

function unvalidatedRoot(sourceCode, expression) {
  const pending = [expression];
  for (const current of pending) {
    if (
      current.type === 'CallExpression' &&
      NON_VALIDATING_METHODS.has(memberName(current.callee))
    ) {
      pending.push(current.callee.object);
    }
  }
  return pending.find((current) => isZodCall(sourceCode, current, UNVALIDATED_FACTORIES));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow z.unknown() and z.any() as a field of a z.object schema',
    },
    schema: [],
    messages: {
      unvalidatedField:
        '{{factory}}() as a field only checks that the key exists and hands the value on unchecked. Validate the field in the schema, e.g. z.string().trim().min(1) or z.email(). An exception fits only when the field is genuinely opaque.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        const [shape] = node.arguments;
        if (
          !isZodCall(sourceCode, node, OBJECT_SCHEMA_FACTORIES) ||
          shape?.type !== 'ObjectExpression'
        ) {
          return;
        }
        for (const property of shape.properties) {
          if (property.type !== 'Property') continue;
          const root = unvalidatedRoot(sourceCode, property.value);
          if (root !== undefined) {
            context.report({
              node: property.value,
              messageId: 'unvalidatedField',
              data: { factory: `z.${memberName(root.callee)}` },
            });
          }
        }
      },
    };
  },
};
