import ts from 'typescript';
import { depthFirst } from '../../../../../../shared/traversal.mjs';
import { ancestorsOf } from '../analysis/ancestry.mjs';
import { enclosingFunction, isEffectCallback } from './react-effects.mjs';

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

function effectOfCall(sourceCode, call) {
  const caller = enclosingFunction(call);
  return caller !== undefined && isEffectCallback(sourceCode, caller) ? caller : undefined;
}

function bindingOf(fn) {
  if (fn.type === 'FunctionDeclaration') {
    return fn;
  }
  const declarator = fn.parent;
  return declarator.type === 'VariableDeclarator' && declarator.init === fn
    ? declarator
    : undefined;
}

function directCallsOf(sourceCode, fn) {
  if (fn.parent.type === 'CallExpression' && fn.parent.callee === fn) {
    return [fn.parent];
  }
  const binding = bindingOf(fn);
  const variables = binding === undefined ? [] : sourceCode.getDeclaredVariables(binding);
  return variables
    .flatMap((variable) => variable.references)
    .map(({ identifier }) => identifier)
    .filter((identifier) => identifier.parent.type === 'CallExpression')
    .filter((identifier) => identifier.parent.callee === identifier)
    .map((identifier) => identifier.parent);
}

function owningEffect(sourceCode, node) {
  const fn = enclosingFunction(node);
  if (fn === undefined || isEffectCallback(sourceCode, fn)) {
    return fn;
  }
  const outer = ancestorsOf(fn);
  return directCallsOf(sourceCode, fn)
    .map((call) => effectOfCall(sourceCode, call))
    .find((effect) => effect !== undefined && outer.includes(effect));
}

function isThenable(type) {
  return [...depthFirst(type, (member) => member.types ?? [])].some(
    (member) => member.getProperty('then') !== undefined,
  );
}

const settledWithoutValue = ts.TypeFlags.Void | ts.TypeFlags.Undefined;

function isDiscarded(node) {
  const outer = node.parent.type === 'ChainExpression' ? node.parent.parent : node.parent;
  return outer.type === 'UnaryExpression' && outer.operator === 'void';
}

function isDiscardedVoidPromise(checker, node, type) {
  const awaited = checker.getAwaitedType(type);
  const settled = awaited?.types ?? (awaited === undefined ? [] : [awaited]);
  return (
    isDiscarded(node) &&
    settled.length > 0 &&
    settled.every((member) => (member.flags & settledWithoutValue) !== 0)
  );
}

function startsAsyncWork(context, node) {
  const services = context.sourceCode.parserServices;
  if (!services?.program) {
    return false;
  }
  const checker = services.program.getTypeChecker();
  const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  return isThenable(type) && !isDiscardedVoidPromise(checker, node, type);
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

    function checkAsync(node) {
      const effect = owningEffect(context.sourceCode, node);
      if (effect === undefined || entryFor(effect).firstAsync !== undefined) {
        return;
      }
      if (node.type === 'AwaitExpression' || startsAsyncWork(context, node)) {
        entryFor(effect).firstAsync = node;
      }
    }

    function check(node) {
      const effect = effectCallbackOf(context.sourceCode, node);
      if (effect !== undefined && sendsRequest(node)) {
        entryFor(effect).requested = true;
        context.report({ node, messageId: 'fetchInEffect' });
      } else {
        checkAsync(node);
      }
    }

    return {
      CallExpression: check,
      NewExpression: check,
      AwaitExpression: checkAsync,
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
