import { childrenOf } from '../loops/loop-shapes.mjs';
import { describePath } from '../support/io-effects.mjs';
import { isIsolated, itemWork, settlesAll } from './item-loops.mjs';
import { jobKind } from './job-handlers.mjs';

const FUNCTIONS = new Set(['FunctionExpression', 'ArrowFunctionExpression']);

function isFixedList(loop) {
  return (
    loop.right.type === 'ArrayExpression' && loop.right.elements.every((e) => e?.type === 'Literal')
  );
}

function loopsIn(body, visitorKeys) {
  const loops = [];
  const pending = [body];
  for (const node of pending) {
    if (node.type === 'ForOfStatement') {
      loops.push(...(isFixedList(node) ? [] : [node]));
    } else {
      pending.push(...childrenOf(node, visitorKeys).filter((child) => !FUNCTIONS.has(child.type)));
    }
  }
  return loops;
}

export const rule = {
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
    function check(fn) {
      const job = jobKind(fn, context.sourceCode.ast);
      if (job === undefined) {
        return;
      }
      for (const loop of loopsIn(fn.body, context.sourceCode.visitorKeys)) {
        const work = itemWork(loop, context).filter(({ call }) => !isIsolated(call, loop));
        if (work.length > 0 && !settlesAll(loop, context)) {
          context.report({
            node: loop,
            messageId: 'unisolated',
            data: { job, work: describePath(work[0].path) },
          });
        }
      }
    }
    return { FunctionExpression: check, ArrowFunctionExpression: check };
  },
};
