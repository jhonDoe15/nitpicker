import { resolveConstant } from './test-code-analysis.mjs';

function propertyName(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return undefined;
}

function isJsonStringify(callee) {
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'JSON' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'stringify'
  );
}

/** Keys of an object literal, following same-file const spreads; undefined if a spread is opaque. */
function knownKeys(context, node, seen = new Set()) {
  const resolved = resolveConstant(context, node);
  if (resolved?.type !== 'ObjectExpression' || seen.has(resolved)) return undefined;
  seen.add(resolved);
  const keys = new Set();
  for (const property of resolved.properties) {
    if (property.type === 'SpreadElement') {
      const spread = knownKeys(context, property.argument, seen);
      if (spread === undefined) return undefined;
      for (const key of spread) keys.add(key);
    } else {
      const name = propertyName(property);
      if (name !== undefined) keys.add(name);
    }
  }
  return keys;
}

export const rule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unpinnedTsconfig:
        "A tsconfig a test writes must set compilerOptions.types and compilerOptions.lib (or noLib), for example types: [] and lib: ['ES2022'], so tsc does not load every @types package and the full default lib.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isJsonStringify(node.callee)) return;
        const config = resolveConstant(context, node.arguments[0]);
        if (config?.type !== 'ObjectExpression') return;
        const compilerOptions = config.properties.find(
          (property) => propertyName(property) === 'compilerOptions',
        );
        if (!compilerOptions) return;
        const keys = knownKeys(context, compilerOptions.value);
        if (keys === undefined) return;
        if (keys.has('types') && (keys.has('lib') || keys.has('noLib'))) return;
        context.report({ node: compilerOptions, messageId: 'unpinnedTsconfig' });
      },
    };
  },
};
