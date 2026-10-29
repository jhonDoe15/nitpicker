import { ancestorsOf } from '../analysis/ancestry.mjs';
import { heldScope } from '../effects/held-scopes.mjs';
import { contains } from '../loops/loop-shapes.mjs';

const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

function isCommittedBefore(write, publish, context) {
  const scope = heldScope('transaction', write.call, context);
  const closing = scope?.closing;
  return closing !== undefined && closing.range[1] <= publish.call.range[0];
}

function isInAfterCommitHook(call, unit) {
  return ancestorsOf(call)
    .filter(
      (ancestor) => FUNCTIONS.has(ancestor.type) && contains(unit, ancestor) && ancestor !== unit,
    )
    .some(
      (fn) =>
        fn.parent.type === 'CallExpression' &&
        fn.parent.arguments.includes(fn) &&
        fn.parent.callee.property?.name === 'afterCommit',
    );
}

export function publishesAfterCommit(publish, writes, { context, unit }) {
  return (
    isInAfterCommitHook(publish.call, unit) ||
    writes.every((write) => isCommittedBefore(write, publish, context))
  );
}
