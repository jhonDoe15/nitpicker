import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { childrenOf } from '../loops/loop-shapes.mts';
import { describePath } from '../support/io-effects.mts';
import type { VisitorKeys } from '../typed/node-views.mts';
import { isIsolated, itemWork, settlesAll } from './item-loops.mts';
import { jobKind } from './job-handlers.mts';

const FUNCTIONS = new Set<string>([
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
]);

function isFixedList(loop: TSESTree.ForOfStatement): boolean {
  return (
    loop.right.type === AST_NODE_TYPES.ArrayExpression &&
    loop.right.elements.every((element) => element?.type === AST_NODE_TYPES.Literal)
  );
}

function loopsIn(body: TSESTree.Node, visitorKeys: VisitorKeys): TSESTree.ForOfStatement[] {
  const loops: TSESTree.ForOfStatement[] = [];
  const pending = [body];
  for (const node of pending) {
    if (node.type === AST_NODE_TYPES.ForOfStatement) {
      loops.push(...(isFixedList(node) ? [] : [node]));
    } else {
      pending.push(...childrenOf(node, visitorKeys).filter((child) => !FUNCTIONS.has(child.type)));
    }
  }
  return loops;
}

function check(
  context: TSESLint.RuleContext<'unisolated', []>,
  fn: TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression,
): void {
  const job = jobKind(fn, context.sourceCode.ast);
  if (job === undefined) {
    return;
  }
  for (const loop of loopsIn(fn.body, context.sourceCode.visitorKeys)) {
    const [first] = itemWork(loop, context).filter(({ call }) => !isIsolated(call, loop));
    if (first !== undefined && !settlesAll(loop, context)) {
      context.report({
        node: loop,
        messageId: 'unisolated',
        data: { job, work: describePath(first.path) },
      });
    }
  }
}

export const rule: TSESLint.RuleModule<
  'unisolated',
  [],
  { readonly requiresTypeChecking: boolean }
> = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Isolate each item of a scheduled or queue job so one failing item does not stop the rest',
      requiresTypeChecking: true,
    },
    schema: [],
    messages: {
      unisolated: [
        'This loop in the {{job}} awaits {{work}} for each item with no per-item `try`/`catch` or `.catch(...)`, so the',
        'first item that throws skips every item after it until the next run, and an item that keeps failing',
        'blocks the rest for good. Catch and record the failure per item',
        '(`try { ... } catch (error) { logger.error(...) }` or `.catch((error) => logger.error(error))`), enqueue one job per item, or use',
        '`Promise.allSettled` and report the failures.',
        'An exception fits only when the whole run must fail so that it is retried.',
      ].join(' '),
    },
  },
  create(context) {
    return {
      FunctionExpression: (node) => check(context, node),
      ArrowFunctionExpression: (node) => check(context, node),
    };
  },
};
