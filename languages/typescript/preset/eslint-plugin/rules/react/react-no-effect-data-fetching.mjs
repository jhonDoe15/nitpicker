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

const timerFunctions = new Set(['setTimeout', 'setInterval', 'requestAnimationFrame']);
const promiseCallbacks = new Set(['then', 'catch', 'finally']);
const stateSetter = /^set[A-Z]/u;
const MAX_OWNERS = 8;

function calleeName(call) {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : undefined;
}

function isTimerCallback(fn) {
  const call = fn.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments[0] === fn &&
    timerFunctions.has(calleeName(call))
  );
}

function isPromiseCallback(fn) {
  const call = fn.parent;
  return (
    call.type === 'CallExpression' &&
    call.arguments.includes(fn) &&
    call.callee.type === 'MemberExpression' &&
    promiseCallbacks.has(calleeName(call))
  );
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

function startingFunction(sourceCode, fn) {
  const outer = enclosingFunction(fn);
  if (outer === undefined) {
    return undefined;
  }
  if (isTimerCallback(fn) || isPromiseCallback(fn)) {
    return outer;
  }
  const calledHere = directCallsOf(sourceCode, fn).some(
    (call) => enclosingFunction(call) === outer,
  );
  return calledHere ? outer : undefined;
}

function ownerChain(sourceCode, node) {
  const chain = [enclosingFunction(node)];
  for (const fn of chain) {
    if (fn === undefined || isEffectCallback(sourceCode, fn)) {
      break;
    }
    if (chain.length > MAX_OWNERS) {
      return [];
    }
    chain.push(startingFunction(sourceCode, fn));
  }
  const effect = chain.at(-1);
  return effect !== undefined && isEffectCallback(sourceCode, effect) ? chain : [];
}

function isStateSetter(node) {
  return node?.type === 'Identifier' && stateSetter.test(node.name);
}

function promiseOrigin(callback) {
  const call = callback.parent;
  return call.callee.object;
}

function asyncOrigin({ chain, anchor, awaitsIn }) {
  for (const [index, fn] of chain.entries()) {
    const before = index === 0 ? anchor : chain[index - 1];
    const awaited = (awaitsIn.get(fn) ?? []).find((node) => node.range[0] < before.range[1]);
    if (awaited !== undefined) {
      return awaited;
    }
    if (isPromiseCallback(fn)) {
      return promiseOrigin(fn);
    }
  }
  return undefined;
}

function entryFor(state, effect) {
  if (!state.effects.has(effect)) {
    state.effects.set(effect, { requested: false, firstAsync: undefined });
  }
  return state.effects.get(effect);
}

function recordAsync(state, chain, origin) {
  const entry = entryFor(state, chain.at(-1));
  if (entry.firstAsync === undefined || origin.range[0] < entry.firstAsync.range[0]) {
    entry.firstAsync = origin;
  }
}

function checkSetterUse(state, chain, node) {
  if (isStateSetter(node.callee)) {
    state.setterCalls.push({ chain, anchor: node });
  }
  const passesSetter =
    promiseCallbacks.has(calleeName(node)) &&
    node.arguments.some(isStateSetter) &&
    node.callee.type === 'MemberExpression';
  if (passesSetter) {
    recordAsync(state, chain, node.callee.object);
  }
}

function checkCall(context, state, node) {
  const chain = ownerChain(context.sourceCode, node);
  if (chain.length === 0) {
    return;
  }
  if (sendsRequest(node)) {
    entryFor(state, chain.at(-1)).requested = true;
    context.report({ node, messageId: 'fetchInEffect' });
    return;
  }
  if (node.type === 'CallExpression') {
    checkSetterUse(state, chain, node);
  }
}

function reportAsyncWork(context, state) {
  for (const setter of state.setterCalls) {
    const origin = asyncOrigin({ ...setter, awaitsIn: state.awaitsIn });
    if (origin !== undefined) {
      recordAsync(state, setter.chain, origin);
    }
  }
  for (const { requested, firstAsync } of state.effects.values()) {
    if (!requested && firstAsync !== undefined) {
      context.report({ node: firstAsync, messageId: 'asyncInEffect' });
    }
  }
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
      asyncInEffect:
        'Do not load state asynchronously in `useEffect` (a state setter after `await` or in a `.then` callback): it races the render and nothing caches the result. Load data with `useQuery` or a route loader; run an action (a save, a clipboard write) in the event handler that causes it; redirect by rendering `<Navigate />`. An exception fits only when this effect only synchronizes with an external system.',
    },
  },
  create(context) {
    const state = { awaitsIn: new Map(), setterCalls: [], effects: new Map() };
    return {
      CallExpression(node) {
        checkCall(context, state, node);
      },
      NewExpression(node) {
        checkCall(context, state, node);
      },
      AwaitExpression(node) {
        const fn = enclosingFunction(node);
        state.awaitsIn.set(fn, [...(state.awaitsIn.get(fn) ?? []), node]);
      },
      'Program:exit'() {
        reportAsyncWork(context, state);
      },
    };
  },
};
