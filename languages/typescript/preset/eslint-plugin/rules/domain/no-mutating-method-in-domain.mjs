import {
  isArrayMutator,
  mutatedOwner,
  staticName,
} from '../analysis/mutation/mutating-methods.mjs';

const INDIRECT_CALLS = new Set(['call', 'apply', 'bind']);

function isPlainCallee(node) {
  return !node.computed && node.parent.type === 'CallExpression' && node.parent.callee === node;
}

function isReportedBySyntax(node, method) {
  if (!isArrayMutator(method) || node.computed) {
    return false;
  }
  if (isPlainCallee(node)) {
    return true;
  }
  const outer = node.parent;
  return (
    outer.type === 'MemberExpression' &&
    outer.object === node &&
    INDIRECT_CALLS.has(outer.property.name) &&
    isPlainCallee(outer)
  );
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow mutating methods of arrays, Set, Map, Date, typed arrays, Buffer and URLSearchParams in domain code',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      mutatingMethod:
        'domain/ code does not mutate values, and {{owner}}.{{method}} changes the value it is called on: build a new value instead, e.g. new Set([...set, x]), new Map([...map, [key, value]]), new Map(xs.map((x) => [x.id, x] as const)) or new Date(ms + delta).',
    },
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    if (services?.program === undefined || services.program === null) {
      throw new Error(
        'no-mutating-method-in-domain needs type information (parserOptions.projectService)',
      );
    }
    return {
      MemberExpression(node) {
        const method = staticName(node, services);
        if (method === undefined || isReportedBySyntax(node, method)) {
          return;
        }
        const owner = mutatedOwner(node, method, services);
        if (owner !== undefined) {
          context.report({ node, messageId: 'mutatingMethod', data: { owner, method } });
        }
      },
    };
  },
};
