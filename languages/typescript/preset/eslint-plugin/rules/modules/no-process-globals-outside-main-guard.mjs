import { depthFirst, objectChildren } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
const PROCESS_MEMBERS = new Set(['argv', 'exit', 'exitCode']);

function isEntryPoint(node) {
  return (
    node?.type === 'MetaProperty' ||
    (node?.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'require' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'main')
  );
}

export function mentionsEntryPoint(node) {
  for (const current of depthFirst(node, objectChildren)) {
    if (isEntryPoint(current)) return true;
  }
  return false;
}

function insideMainGuard(node) {
  for (const current of [node, ...ancestorsOf(node)]) {
    const parent = current.parent;
    if (!parent) continue;
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

export const rule = {
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
