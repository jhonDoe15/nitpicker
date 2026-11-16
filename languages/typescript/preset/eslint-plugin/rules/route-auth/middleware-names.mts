const FASTIFY_OPTIONS = new Set([
  'preHandler',
  'onRequest',
  'preValidation',
  'preParsing',
  'beforeHandler',
]);

export function middlewareName(node) {
  const pending = [node];
  for (const current of pending) {
    if (current.type === 'Identifier') {
      return current.name;
    }
    if (current.type === 'MemberExpression' && !current.computed) {
      return current.property.name;
    }
    if (current.type === 'CallExpression') {
      pending.push(current.callee);
    }
  }
  return undefined;
}

function nestedItems(item) {
  if (item.type === 'ArrayExpression') {
    return item.elements.filter((element) => element !== null);
  }
  if (item.type === 'ObjectExpression') {
    return item.properties
      .filter((property) => property.type === 'Property' && FASTIFY_OPTIONS.has(property.key.name))
      .map((property) => property.value);
  }
  return undefined;
}

export function middlewareIn(arg) {
  const names = [];
  const pending = [arg];
  for (const item of pending) {
    const nested = nestedItems(item);
    const name = nested === undefined ? middlewareName(item) : undefined;
    pending.push(...(nested ?? []));
    if (name !== undefined) {
      names.push(name);
    }
  }
  return names;
}
