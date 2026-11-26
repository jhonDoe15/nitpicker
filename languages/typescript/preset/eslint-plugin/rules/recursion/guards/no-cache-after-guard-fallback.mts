import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { ancestorsOf } from '../../typed/node-views.mts';
import { descendants, fileCalls, isRecursive, type FileFunction } from '../graph/file-calls.mts';
import { keyedUses, type GuardUse } from './guard-uses.mts';

type MessageIds = 'partialCache';
type Finding = { readonly write: GuardUse; readonly guard: GuardUse };

const GUARD_CHECKS = new Set(['add', 'has']);
const CACHE_WRITES = new Set(['set']);
const PARTIAL_MARK = /partial|incomplete|provisional|truncated|cutShort/iu;

function returnsEarly(use: GuardUse): TSESTree.IfStatement | undefined {
  const branch = ancestorsOf(use.call).find(
    (node): node is TSESTree.IfStatement => node.type === AST_NODE_TYPES.IfStatement,
  );
  const inTest = branch !== undefined && descendants(branch.test).includes(use.call);
  const returns =
    branch !== undefined &&
    descendants(branch.consequent).some((node) => node.type === AST_NODE_TYPES.ReturnStatement);
  return inTest && returns ? branch : undefined;
}

function marksPartial(fn: FileFunction): boolean {
  return descendants(fn.node).some(
    (node) => node.type === AST_NODE_TYPES.Identifier && PARTIAL_MARK.test(node.name),
  );
}

function findingOf(fn: FileFunction): Finding | undefined {
  const uses = keyedUses(fn);
  for (const guard of uses.filter((use) => GUARD_CHECKS.has(use.method))) {
    const branch = returnsEarly(guard);
    const write = uses.find(
      (use) =>
        CACHE_WRITES.has(use.method) &&
        use.guard !== guard.guard &&
        use.param === guard.param &&
        branch !== undefined &&
        use.call.range[0] > branch.range[1],
    );
    if (write !== undefined) {
      return { write, guard };
    }
  }
  return undefined;
}

export const rule: TSESLint.RuleModule<MessageIds> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow caching an answer that a recursion guard may have cut short in a deeper turn',
    },
    schema: [],
    messages: {
      partialCache:
        "'{{cache}}' stores this answer although '{{guard}}' refuses turns that come back to a value already in progress, so a deeper turn may have returned its fallback and the stored answer may be partial. What the cache holds then depends on which caller asked first. Do not store an answer that a refused turn fed into (or store it marked as partial and compute it again when asked from outside the cycle).",
    },
  },
  create(context) {
    return {
      'Program:exit'(program: TSESTree.Program) {
        const graph = fileCalls(program);
        for (const fn of graph.functions.values()) {
          const finding = findingOf(fn);
          if (finding !== undefined && !marksPartial(fn) && isRecursive(graph, fn.key)) {
            context.report({
              node: finding.write.call,
              messageId: 'partialCache',
              data: { cache: finding.write.guard, guard: finding.guard.guard },
            });
          }
        }
      },
    };
  },
};
