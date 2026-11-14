import { depthFirst } from '../../../../../../../shared/traversal.mjs';
import { ancestorsOf, contains } from '../../analysis/ancestry.mjs';
import { closersOf, rootIdentifier } from '../scope/close-owners.mjs';
import { astChildren, functionName, isFunctionNode } from '../scope/close-scopes.mjs';
import { collectionsOf, useKind, usesOf } from '../scope/collections.mjs';
import { addedValue, holdsSettlers } from './pending-values.mjs';

const MAX_DEPTH = 3;
const ITERATING = new Set(['forEach', 'values', 'entries', 'keys', 'map']);

function patternNames(pattern) {
  return [...depthFirst(pattern, astChildren)]
    .filter((node) => node.type === 'Identifier')
    .map((node) => node.name);
}

const LOGGERS = new Set(['console', 'logger', 'log']);
const BOOKKEEPING = new Set(['delete', 'has', 'add', 'set', 'push', 'includes']);

function callSettles(node, names) {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const root = rootIdentifier(node.callee)?.name;
  const handed = node.arguments.some((argument) => names.includes(rootIdentifier(argument)?.name));
  const bookkeeping =
    node.callee.type === 'MemberExpression' && BOOKKEEPING.has(node.callee.property.name);
  return names.includes(root) || (handed && !LOGGERS.has(root) && !bookkeeping);
}

function callsAny(body, names) {
  return [...depthFirst(body, astChildren)].some((node) => callSettles(node, names));
}

function callbackSettles(call) {
  return call.arguments.some(
    (callback) =>
      isFunctionNode(callback) && callsAny(callback.body, callback.params.flatMap(patternNames)),
  );
}

function handedOver(use) {
  const { call } = useKind(use);
  const holder = call?.parent;
  return (
    call !== undefined &&
    ((holder.type === 'CallExpression' && holder.arguments.includes(call)) ||
      holder.type === 'SpreadElement')
  );
}

function aliasOf(use) {
  const declarator = ancestorsOf(use).find((node) => node.type === 'VariableDeclarator');
  return declarator?.id.type === 'Identifier' ? declarator.id.name : undefined;
}

function aliasSettled(fn, alias) {
  return [...depthFirst(fn, astChildren)].some((node) => {
    if (node.type === 'ForOfStatement') {
      return (
        rootIdentifier(node.right)?.name === alias && callsAny(node.body, patternNames(node.left))
      );
    }
    return (
      node.type === 'CallExpression' &&
      (node.arguments.some((argument) => rootIdentifier(argument)?.name === alias) ||
        (node.callee.type === 'MemberExpression' &&
          ITERATING.has(node.callee.property.name) &&
          rootIdentifier(node.callee.object)?.name === alias &&
          callbackSettles(node)))
    );
  });
}

function iteratesAndCalls(use) {
  return ancestorsOf(use).some((node) => {
    if (node.type === 'ForOfStatement') {
      return contains(node.right, use) && callsAny(node.body, patternNames(node.left));
    }
    return (
      node.type === 'CallExpression' &&
      node.callee.type === 'MemberExpression' &&
      ITERATING.has(node.callee.property.name) &&
      contains(node.callee.object, use) &&
      callbackSettles(node)
    );
  });
}

function settlesIn(fn, uses) {
  return uses
    .filter((use) => contains(fn, use))
    .some((use) => {
      const { kind } = useKind(use);
      if (kind === 'escape') {
        return true;
      }
      if (kind !== 'read') {
        return false;
      }
      const alias = aliasOf(use);
      return (
        handedOver(use) || iteratesAndCalls(use) || (alias !== undefined && aliasSettled(fn, alias))
      );
    });
}

function calleeName(call) {
  return call.callee.type === 'MemberExpression' ? call.callee.property.name : call.callee.name;
}

function ownCalls(fn, container, closers) {
  const names = [...depthFirst(fn, astChildren)]
    .filter((node) => node.type === 'CallExpression')
    .map(calleeName);
  return [...depthFirst(container, astChildren)].filter(
    (node) => isFunctionNode(node) && names.includes(functionName(node)) && !closers.includes(node),
  );
}

function reachable(closer, container, closers) {
  const walked = Array.from({ length: MAX_DEPTH }).reduce(
    (state) => {
      const next = state.frontier
        .flatMap((fn) => ownCalls(fn, container, closers))
        .filter((fn) => !state.seen.has(fn));
      return { seen: new Set([...state.seen, ...next]), frontier: next };
    },
    { seen: new Set([closer]), frontier: [closer] },
  );
  return [...walked.seen];
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a close function to settle the pending requests a scope keeps in a map before it clears them',
    },
    schema: [],
    messages: {
      unsettled:
        '{{name}} keeps pending requests (callbacks or resolve and reject pairs), but {{closer}}() never settles them, so every caller still waiting hangs forever. Reject each entry with an error before clearing: `for (const entry of {{name}}.values()) { entry.reject(new Error("closed")); } {{name}}.clear();`, or hand {{name}} to a helper that does. An exception fits only when the entries are settled elsewhere before the scope closes.',
    },
  },
  create(context) {
    const { sourceCode } = context;

    function check(container) {
      const closers = closersOf(container);
      if (closers.length === 0) {
        return;
      }
      for (const binding of collectionsOf(sourceCode, container)) {
        const uses = usesOf(binding, container);
        const added = uses.map(useKind).filter(({ kind }) => kind === 'add');
        if (!holdsSettlers(binding, added.map(addedValue))) {
          continue;
        }
        const settled = closers.some((closer) =>
          reachable(closer, container, closers).some((fn) => settlesIn(fn, uses)),
        );
        if (!settled) {
          context.report({
            node: binding.node,
            messageId: 'unsettled',
            data: { name: binding.name, closer: functionName(closers[0]) },
          });
        }
      }
    }

    return {
      ClassBody: check,
      Program: check,
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression': check,
    };
  },
};
