import { type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { type FunctionNode } from '../../typed/syntax-views.mts';
import { bodyNodesOf, readWriteCacheWrites, type CacheWrite } from './cache-ops.mts';
import { directCalleesOf, fileFunctionsOf } from './callee-lookup.mts';
import { findRecursionGuard, type RecursionGuard } from './recursion-guards.mts';
import { isGuardedWrite, isSeedWrite } from './write-guards.mts';

type MessageId = 'cachedPartialRecursion';

function calleeGuardOf(
  callees: readonly FunctionNode[],
  cacheTargets: ReadonlySet<string>,
): RecursionGuard | undefined {
  for (const callee of callees) {
    const found = findRecursionGuard(bodyNodesOf(callee), cacheTargets);
    if (found !== undefined) {
      return { ...found, entryPos: undefined };
    }
  }
  return undefined;
}

function unguardedWrites(
  fn: FunctionNode,
  nodes: readonly TSESTree.Node[],
  fileFunctions: Map<string, FunctionNode>,
): { readonly writes: CacheWrite[]; readonly guard: RecursionGuard } | undefined {
  const writes = readWriteCacheWrites(nodes);
  if (writes.length === 0) {
    return undefined;
  }
  const cacheTargets = new Set(writes.map((write) => write.target));
  const guard =
    findRecursionGuard(nodes, cacheTargets) ??
    calleeGuardOf(directCalleesOf(fn, nodes, fileFunctions), cacheTargets);
  if (guard === undefined) {
    return undefined;
  }
  const reported = writes.filter(
    (write) =>
      write.target !== guard.name &&
      !isSeedWrite(write, nodes, guard) &&
      !isGuardedWrite(write, fn, guard),
  );
  return reported.length === 0 ? undefined : { writes: reported, guard };
}

export const rule: TSESLint.RuleModule<MessageId> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow caching a computed result unconditionally while a recursion guard may have cut an inner turn short',
    },
    schema: [],
    messages: {
      cachedPartialRecursion:
        'Storing a result in `{{cache}}` while `{{guard}}` may have cut an inner turn short makes the cached value depend on which caller came first. Track whether `{{guard}}` was hit and skip writing to `{{cache}}` on partial results.',
    },
  },
  create(context) {
    const fileFunctions = fileFunctionsOf(context.sourceCode.ast);
    function inspect(node: FunctionNode): void {
      const finding = unguardedWrites(node, bodyNodesOf(node), fileFunctions);
      if (finding === undefined) {
        return;
      }
      for (const write of finding.writes) {
        context.report({
          node: write.node,
          messageId: 'cachedPartialRecursion',
          data: { cache: write.target, guard: finding.guard.name },
        });
      }
    }
    return {
      FunctionDeclaration: inspect,
      FunctionExpression: inspect,
      ArrowFunctionExpression: inspect,
    };
  },
};
