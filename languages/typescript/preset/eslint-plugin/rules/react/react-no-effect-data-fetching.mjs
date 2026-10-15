import { ancestorsOf } from '../analysis/ancestry.mjs';
import { isEffectCallback } from './react-effects.mjs';

const requestFunctions = new Set(['fetch', 'axios', 'ky']);
const requestLibraries = new Set(['axios', 'ky']);
const globalObjects = new Set(['window', 'globalThis', 'self']);

function isGlobalFetch(callee) {
  return (
    globalObjects.has(callee.object.name) && !callee.computed && callee.property.name === 'fetch'
  );
}

function isMemberRequest(callee) {
  return (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    (requestLibraries.has(callee.object.name) || isGlobalFetch(callee))
  );
}

function sendsRequest(node) {
  if (node.type === 'NewExpression') {
    return node.callee.type === 'Identifier' && node.callee.name === 'XMLHttpRequest';
  }
  return (
    (node.callee.type === 'Identifier' && requestFunctions.has(node.callee.name)) ||
    isMemberRequest(node.callee)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow fetching data inside useEffect',
    },
    schema: [],
    messages: {
      fetchInEffect:
        'Do not fetch data in `useEffect`: it races and caches nothing. Use `useQuery` or a route loader. An exception fits only when this request is not data for rendering (an analytics beacon).',
    },
  },
  create(context) {
    function check(node) {
      if (
        sendsRequest(node) &&
        ancestorsOf(node).some((ancestor) => isEffectCallback(context.sourceCode, ancestor))
      ) {
        context.report({ node, messageId: 'fetchInEffect' });
      }
    }

    return { CallExpression: check, NewExpression: check };
  },
};
