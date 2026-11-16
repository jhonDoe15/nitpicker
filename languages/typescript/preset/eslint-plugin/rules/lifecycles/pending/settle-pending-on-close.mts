import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf, contains, depthFirst, nameOf } from '../../typed/node-views.mts';
import { closersOf, rootIdentifier } from '../scope/close-owners.mts';
import {
  astChildren,
  functionName,
  isFunctionNode,
  type FunctionNode,
  type NonRoot,
} from '../scope/close-scopes.mts';
import { collectionsOf, useKind, usesOf } from '../scope/collections.mts';
import { addedValue, holdsSettlers } from './pending-values.mts';

const MAX_DEPTH = 3;
const ITERATING = new Set<string>(['forEach', 'values', 'entries', 'keys', 'map']);

function patternNames(pattern: TSESTree.Node): string[] {
  return [...depthFirst(pattern, astChildren)]
    .filter((node) => node.type === AST_NODE_TYPES.Identifier)
    .map((node) => node.name);
}

const LOGGERS = new Set<string>(['console', 'logger', 'log']);
const BOOKKEEPING = new Set<string>(['delete', 'has', 'add', 'set', 'push', 'includes']);

function callSettles(node: TSESTree.Node, names: readonly string[]): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const root = rootIdentifier(node.callee)?.name;
  const handed = node.arguments.some((argument) => {
    const argumentRoot = rootIdentifier(argument)?.name;
    return argumentRoot !== undefined && names.includes(argumentRoot);
  });
  const bookkeeping =
    node.callee.type === AST_NODE_TYPES.MemberExpression &&
    BOOKKEEPING.has(nameOf(node.callee.property) ?? '');
  return (
    (root !== undefined && names.includes(root)) ||
    (handed && !LOGGERS.has(root ?? '') && !bookkeeping)
  );
}

function callsAny(body: TSESTree.Node, names: readonly string[]): boolean {
  return [...depthFirst(body, astChildren)].some((node) => callSettles(node, names));
}

function callbackSettles(call: TSESTree.CallExpression): boolean {
  return call.arguments.some(
    (callback) =>
      isFunctionNode(callback) && callsAny(callback.body, callback.params.flatMap(patternNames)),
  );
}

function handedOver(use: NonRoot): boolean {
  const { call } = useKind(use);
  if (call === undefined) {
    return false;
  }
  const holder = call.parent;
  return (
    (holder.type === AST_NODE_TYPES.CallExpression &&
      holder.arguments.some((argument) => argument === call)) ||
    holder.type === AST_NODE_TYPES.SpreadElement
  );
}

function aliasOf(use: NonRoot): string | undefined {
  const declarator = ancestorsOf(use).find(
    (node) => node.type === AST_NODE_TYPES.VariableDeclarator,
  );
  return declarator?.id.type === AST_NODE_TYPES.Identifier ? declarator.id.name : undefined;
}

function aliasSettled(fn: FunctionNode, alias: string): boolean {
  return [...depthFirst(fn, astChildren)].some((node) => {
    if (node.type === AST_NODE_TYPES.ForOfStatement) {
      return (
        rootIdentifier(node.right)?.name === alias && callsAny(node.body, patternNames(node.left))
      );
    }
    return (
      node.type === AST_NODE_TYPES.CallExpression &&
      (node.arguments.some((argument) => rootIdentifier(argument)?.name === alias) ||
        (node.callee.type === AST_NODE_TYPES.MemberExpression &&
          ITERATING.has(nameOf(node.callee.property) ?? '') &&
          rootIdentifier(node.callee.object)?.name === alias &&
          callbackSettles(node)))
    );
  });
}

function iteratesAndCalls(use: NonRoot): boolean {
  return ancestorsOf(use).some((node) => {
    if (node.type === AST_NODE_TYPES.ForOfStatement) {
      return contains(node.right, use) && callsAny(node.body, patternNames(node.left));
    }
    return (
      node.type === AST_NODE_TYPES.CallExpression &&
      node.callee.type === AST_NODE_TYPES.MemberExpression &&
      ITERATING.has(nameOf(node.callee.property) ?? '') &&
      contains(node.callee.object, use) &&
      callbackSettles(node)
    );
  });
}

function settlesIn(fn: FunctionNode, uses: readonly NonRoot[]): boolean {
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

function calleeName(call: TSESTree.CallExpression): string | undefined {
  return nameOf(
    call.callee.type === AST_NODE_TYPES.MemberExpression ? call.callee.property : call.callee,
  );
}

function ownCalls(
  fn: FunctionNode,
  container: TSESTree.Node,
  closers: readonly FunctionNode[],
): FunctionNode[] {
  const names = [...depthFirst(fn, astChildren)]
    .filter((node) => node.type === AST_NODE_TYPES.CallExpression)
    .map(calleeName);
  return [...depthFirst(container, astChildren)].filter(
    (node): node is FunctionNode =>
      isFunctionNode(node) && names.includes(functionName(node)) && !closers.includes(node),
  );
}

function reachable(
  closer: FunctionNode,
  container: TSESTree.Node,
  closers: readonly FunctionNode[],
): FunctionNode[] {
  const walked = Array.from({ length: MAX_DEPTH }).reduce<{
    readonly seen: ReadonlySet<FunctionNode>;
    readonly frontier: readonly FunctionNode[];
  }>(
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

export const rule: TSESLint.RuleModule<'unsettled'> = {
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

    function check(container: TSESTree.Node): void {
      const closers = closersOf(container);
      const [firstCloser] = closers;
      if (firstCloser === undefined) {
        return;
      }
      for (const binding of collectionsOf(sourceCode, container)) {
        const uses = usesOf(binding, container);
        const added = uses.flatMap((use) => {
          const found = useKind(use);
          return found.kind === 'add' ? [found] : [];
        });
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
            data: { name: binding.name, closer: functionName(firstCloser) },
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
