import { ancestorsOf } from '../analysis/ancestry.mjs';

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const EXCEPTION_ROUTE =
  ' If the recursion is bounded and deliberate, add an exception for this rule in nitpicker.config.json.';
const DOMAIN_PATH = /(?:^|\/)features\/[^/]+\/domain\//;

function boundFunction(definition) {
  if (definition.type === 'FunctionName') {
    return definition.node;
  }
  const init = definition.type === 'Variable' ? definition.node.init : undefined;
  return init !== undefined && init !== null && FUNCTION_TYPES.has(init.type) ? init : undefined;
}

const ITERATION_METHODS = new Set([
  'map',
  'flatMap',
  'forEach',
  'filter',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'toSorted',
  'sort',
]);

function isIterationCallback(identifier, call) {
  return (
    call.arguments.includes(identifier) &&
    call.callee.type === 'MemberExpression' &&
    ITERATION_METHODS.has(call.callee.property.name)
  );
}

const DEFERRING_CALLEES = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  'nextTick',
  'on',
  'once',
  'addEventListener',
  'addListener',
  'prependListener',
  'subscribe',
]);

function calleeName(callee) {
  if (callee.type === 'Identifier') {
    return callee.name;
  }
  return callee.type === 'MemberExpression' ? callee.property.name : undefined;
}

function isRunByItsCall(fn) {
  const { parent } = fn;
  if (parent.type !== 'CallExpression' || !parent.arguments.includes(fn)) {
    return false;
  }
  if (isIterationCallback(fn, parent)) {
    return true;
  }
  return (
    parent.parent.type !== 'ExpressionStatement' &&
    !DEFERRING_CALLEES.has(calleeName(parent.callee))
  );
}

function callingFunction(node, target) {
  const functions = ancestorsOf(node).filter((current) => FUNCTION_TYPES.has(current.type));
  return functions.find((fn) => fn === target || !isRunByItsCall(fn)) ?? functions.at(-1);
}

function isCallEdge({ identifier }) {
  const { parent } = identifier;
  if (parent.type !== 'CallExpression' && parent.type !== 'NewExpression') {
    return false;
  }
  return parent.callee === identifier || isIterationCallback(identifier, parent);
}

function edgesTo(variable) {
  const target = variable.defs.map(boundFunction).find((fn) => fn !== undefined);
  if (target === undefined) {
    return [];
  }
  return variable.references
    .filter(isCallEdge)
    .map(({ identifier }) => ({
      source: callingFunction(identifier, target),
      target,
      node: identifier,
    }))
    .filter(({ source }) => source !== undefined);
}

function callGraph(sourceCode) {
  return sourceCode.scopeManager.scopes.flatMap((scope) => scope.variables).flatMap(edgesTo);
}

function reachableFrom(start, edges) {
  const seen = new Set([start]);
  for (const current of seen) {
    for (const edge of edges.filter(({ source }) => source === current)) {
      seen.add(edge.target);
    }
  }
  return seen;
}

function nameOf(fn) {
  return fn.id?.name ?? fn.parent.id?.name;
}

function callsBack(source, target, edges) {
  return edges.some((edge) => edge.source === target && edge.target === source);
}

function startsCycle({ source, target }, edges) {
  const closedByNestedCall =
    ancestorsOf(target).includes(source) && callsBack(source, target, edges);
  if (closedByNestedCall || !reachableFrom(target, edges).has(source)) {
    return false;
  }
  const members = [...reachableFrom(source, edges)].filter((member) =>
    reachableFrom(member, edges).has(source),
  );
  return members.every((member) => source.range[0] <= member.range[0]);
}

function recursionReport(edge, edges, messageId) {
  const { source, target, node } = edge;
  if (source === target) {
    return { node, messageId, data: { name: nameOf(source) } };
  }
  if (ancestorsOf(source).includes(target) && reachableFrom(target, edges).has(source)) {
    return { node, messageId, data: { name: nameOf(target) } };
  }
  if (!startsCycle(edge, edges)) {
    return undefined;
  }
  return {
    node,
    messageId: 'mutualRecursion',
    data: { name: nameOf(source), other: nameOf(target) },
  };
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a function that calls itself, directly or through another function',
    },
    schema: [],
    messages: {
      recursion: `'{{name}}' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) { pending.push(...children) }). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported.${EXCEPTION_ROUTE}`,
      domainRecursion: `'{{name}}' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries.${EXCEPTION_ROUTE}`,
      mutualRecursion: `'{{name}}' and '{{other}}' call each other. Replace the cycle with a for...of loop over a worklist, or merge them into one function that loops.${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const messageId = DOMAIN_PATH.test(context.filename.replaceAll('\\', '/'))
      ? 'domainRecursion'
      : 'recursion';

    return {
      'Program:exit'() {
        const edges = callGraph(context.sourceCode);
        for (const edge of edges) {
          const report = recursionReport(edge, edges, messageId);
          if (report !== undefined) {
            context.report(report);
          }
        }
      },
    };
  },
};
