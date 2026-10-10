const PROCESS_MEMBERS = new Set(['argv', 'exit', 'exitCode']);

function mentionsEntryPoint(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'MetaProperty') return true;
  if (
    node.type === 'MemberExpression' &&
    node.object.type === 'Identifier' &&
    node.object.name === 'require' &&
    node.property.type === 'Identifier' &&
    node.property.name === 'main'
  ) {
    return true;
  }
  return Object.entries(node).some(
    ([key, value]) =>
      key !== 'parent' &&
      (Array.isArray(value)
        ? value.some(mentionsEntryPoint)
        : value !== null && typeof value === 'object' && mentionsEntryPoint(value)),
  );
}

function insideMainGuard(node) {
  for (let current = node; current.parent; current = current.parent) {
    const parent = current.parent;
    if (
      parent.type === 'IfStatement' &&
      (current === parent.test || current === parent.consequent) &&
      mentionsEntryPoint(parent.test)
    ) {
      return true;
    }
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      processGlobalOutsideGuard:
        'A test helper or fixture script may use process.{{member}} only inside a main guard such as `if (import.meta.main)`. Export a function that takes the arguments and returns the exit code, and call it from the main guard, so tests can import it instead of spawning it.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (
          node.computed ||
          node.object.type !== 'Identifier' ||
          node.object.name !== 'process' ||
          node.property.type !== 'Identifier' ||
          !PROCESS_MEMBERS.has(node.property.name) ||
          insideMainGuard(node)
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'processGlobalOutsideGuard',
          data: { member: node.property.name },
        });
      },
    };
  },
};
