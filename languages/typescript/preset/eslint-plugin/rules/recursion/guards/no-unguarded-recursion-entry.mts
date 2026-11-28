import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  callsFrom,
  fileCalls,
  reachable,
  type FileCalls,
  type FileFunction,
} from '../graph/file-calls.mts';
import { keyedUses, sharedGuards, touched } from './guard-uses.mts';

type MessageIds = 'unguardedEntry';
type Finding = {
  readonly entry: FileFunction;
  readonly guarded: FileFunction;
  readonly guard: string;
};

function guardOf(fn: FileFunction, guards: ReadonlySet<string>): string | undefined {
  return keyedUses(fn).find((use) => guards.has(use.guard))?.guard;
}

function sharesCycle(graph: FileCalls, guarded: FileFunction, entry: FileFunction): boolean {
  const fromGuarded = callsFrom(graph, guarded.key);
  const fromEntry = callsFrom(graph, entry.key);
  if (fromEntry.has(guarded.key)) {
    return false;
  }
  return [...fromEntry].some((shared) => {
    if (shared === entry.key || !fromGuarded.has(shared)) {
      return false;
    }
    const back = reachable(graph, shared);
    return back.has(guarded.key) && back.has(entry.key);
  });
}

function findingsIn(program: TSESTree.Program): Finding[] {
  const guards = sharedGuards(program);
  if (guards.size === 0) {
    return [];
  }
  const graph = fileCalls(program);
  const functions = [...graph.functions.values()];
  const guardedOnes = functions.flatMap((fn) => {
    const guard = guardOf(fn, guards);
    return guard === undefined ? [] : [{ fn, guard }];
  });
  return functions.flatMap((entry) => {
    const uses = touched(entry);
    const match = guardedOnes.find(
      ({ fn, guard }) => fn !== entry && !uses.has(guard) && sharesCycle(graph, fn, entry),
    );
    return match === undefined ? [] : [{ entry, guarded: match.fn, guard: match.guard }];
  });
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow an entry point into a recursion that skips the re-entry guard its sibling uses',
    },
    schema: [],
    messages: {
      unguardedEntry:
        "'{{name}}' enters the same recursion as '{{guarded}}' (both call a function that calls them back), but only '{{guarded}}' checks '{{guard}}' before going on. A turn that comes in through '{{name}}' is never refused, so nested input makes each turn redo the whole recursion and the work grows exponentially. Check the same guard in '{{name}}', or route it through '{{guarded}}'.",
    },
  },
  create(context) {
    return {
      'Program:exit'(program: TSESTree.Program) {
        for (const { entry, guarded, guard } of findingsIn(program)) {
          context.report({
            node: entry.node,
            messageId: 'unguardedEntry',
            data: { name: entry.name, guarded: guarded.name, guard },
          });
        }
      },
    };
  },
};
