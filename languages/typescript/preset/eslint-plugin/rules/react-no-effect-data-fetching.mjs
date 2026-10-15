import { ancestorsOf } from './ancestry.mjs';
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

function effectCallbackOf(sourceCode, node) {
  return ancestorsOf(node).find((ancestor) => isEffectCallback(sourceCode, ancestor));
}

function isThenable(type) {
  return type.getProperty('then') !== undefined || (type.types?.some(isThenable) ?? false);
}

function returnsPromise(context, node) {
  const services = context.sourceCode.parserServices;
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  return isThenable(checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node)));
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow fetching data inside useEffect',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      fetchInEffect:
        'Do not fetch data in `useEffect`: it races and caches nothing. Use `useQuery` or a route loader. If this request is not data for rendering (an analytics beacon), add an exception for this rule in nitpicker.config.json.',
      asyncInEffect:
        'Do not run async work in `useEffect` (`await` or a call that returns a promise): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. If this effect only synchronizes with an external system, add an exception for this rule in nitpicker.config.json.',
    },
  },
  create(context) {
    const effects = new Map();

    function entryFor(effect) {
      if (!effects.has(effect)) {
        effects.set(effect, { requested: false, firstAsync: undefined });
      }
      return effects.get(effect);
    }

    function check(node) {
      const effect = effectCallbackOf(context.sourceCode, node);
      if (effect === undefined) {
        return;
      }
      const entry = entryFor(effect);
      if (sendsRequest(node)) {
        entry.requested = true;
        context.report({ node, messageId: 'fetchInEffect' });
      } else if (entry.firstAsync === undefined && returnsPromise(context, node)) {
        entry.firstAsync = node;
      }
    }

    function checkAwait(node) {
      const effect = effectCallbackOf(context.sourceCode, node);
      if (effect !== undefined) {
        entryFor(effect).firstAsync ??= node;
      }
    }

    return {
      CallExpression: check,
      NewExpression: check,
      AwaitExpression: checkAwait,
      'Program:exit'() {
        for (const { requested, firstAsync } of effects.values()) {
          if (!requested && firstAsync !== undefined) {
            context.report({ node: firstAsync, messageId: 'asyncInEffect' });
          }
        }
      },
    };
  },
};
