import { variableNamed } from '../analysis/ancestry.mjs';

const OBJECT_SCHEMA_FACTORIES = new Set(['object', 'strictObject', 'looseObject']);
const CONTAINER_FACTORIES = new Set(['record', 'array', 'set', 'map', 'tuple']);
const LOOSE_OBJECT_METHODS = new Set(['passthrough', 'loose']);
const MAX_ALIAS_DEPTH = 3;
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
const CUSTOM_FACTORY = new Set(['custom']);
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

function constantInitializer(sourceCode, identifier) {
  const definition = variableNamed(sourceCode, identifier)?.defs.at(0);
  return definition?.type === 'Variable' && definition.parent.kind === 'const'
    ? (definition.node.init ?? undefined)
    : undefined;
}

function withoutNonValidatingCalls(expression) {
  const pending = [expression];
  for (const current of pending) {
    if (
      current.type === 'CallExpression' &&
      NON_VALIDATING_METHODS.has(memberName(current.callee))
    ) {
      pending.push(current.callee.object);
    }
  }
  return pending.at(-1);
}

function isUnvalidatedLeaf(sourceCode, root) {
  if (isZodCall(sourceCode, root, UNVALIDATED_FACTORIES)) {
    return true;
  }
  return isZodCall(sourceCode, root, CUSTOM_FACTORY) && root.arguments.length === 0;
}

function nestedSchemas(sourceCode, root, depth) {
  if (root.type === 'Identifier') {
    const initializer = depth < MAX_ALIAS_DEPTH ? constantInitializer(sourceCode, root) : undefined;
    return initializer ? [initializer] : [];
  }
  return isZodCall(sourceCode, root, CONTAINER_FACTORIES) ? root.arguments : [];
}

function unvalidatedRoot(sourceCode, expression) {
  const pending = [{ node: expression, depth: 0 }];
  for (const { node, depth } of pending) {
    const root = withoutNonValidatingCalls(node);
    if (isUnvalidatedLeaf(sourceCode, root)) {
      return root;
    }
    const children = nestedSchemas(sourceCode, root, depth);
    pending.push(...children.map((child) => ({ node: child, depth: depth + 1 })));
  }
  return undefined;
}

function chainRoot(expression) {
  const chain = [expression];
  for (const current of chain) {
    if (current.type === 'CallExpression') {
      chain.push(current.callee);
    }
    if (current.type === 'MemberExpression') {
      chain.push(current.object);
    }
  }
  return chain.at(-1);
}

function isOnZod(sourceCode, node) {
  const root = chainRoot(node);
  return root.type === 'Identifier' && isZod(sourceCode, root);
}

function isLooseCall(sourceCode, node) {
  const name = memberName(node.callee);
  if (name === 'looseObject') {
    return isZodCall(sourceCode, node, OBJECT_SCHEMA_FACTORIES);
  }
  if (LOOSE_OBJECT_METHODS.has(name)) {
    return isOnZod(sourceCode, node);
  }
  return (
    name === 'catchall' &&
    isOnZod(sourceCode, node) &&
    unvalidatedRoot(sourceCode, node.arguments[0]) !== undefined
  );
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
        '{{factory}}() as a field only checks that the key exists and hands the value on unchecked. Validate the field in the schema, e.g. z.string().trim().min(1) or z.email(). If the field is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
      customWithoutValidator:
        'z.custom() without a check function is a cast, not a validator. Pass the check, z.custom<T>((value) => ...), or build the schema from validating parts. If the value is genuinely opaque, add an exception for this rule in nitpicker.config.json.',
      looseObject:
        'z.looseObject(), .loose() and .passthrough() let unknown keys through unvalidated, and .catchall(z.unknown()) does the same. Use z.object({...}), which drops unknown keys, or z.strictObject({...}) to reject them. If the extra keys are genuinely opaque, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function reportLooseObject(node) {
      if (isLooseCall(sourceCode, node)) {
        context.report({ node, messageId: 'looseObject' });
      }
    }

    return {
      CallExpression(node) {
        reportLooseObject(node);
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
              messageId:
                memberName(root.callee) === 'custom'
                  ? 'customWithoutValidator'
                  : 'unvalidatedField',
              data: { factory: `z.${memberName(root.callee)}` },
            });
          }
        }
      },
    };
  },
};
