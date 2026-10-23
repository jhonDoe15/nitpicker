import { detachedForm } from './detached-forms.mjs';
import { finallyRegions, referencesIn, usingRegions } from './resource-regions.mjs';

const EXCEPTION_ROUTE =
  ' An exception fits only when the task owns the resource or the resource lives as long as the process.';
const AWAIT_ADVICE =
  'await the task before the block ends (await Promise.all([...]) for several), or open and close the resource inside the task';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow starting a task that uses a resource without waiting for it before the block that disposes the resource ends',
    },
    schema: [],
    messages: {
      detached: `This task is detached with void, but the {{owner}} disposes {{name}} when the block ends, so the task can run on a closed resource. ${AWAIT_ADVICE}.${EXCEPTION_ROUTE}`,
      deferred: `This timer or microtask runs after the block ends, but the {{owner}} has disposed {{name}} by then. Resolve a promise from the callback and await it inside the block, or open and close the resource inside the callback.${EXCEPTION_ROUTE}`,
      unawaited: `This promise is never awaited, but the {{owner}} disposes {{name}} when the block ends, so the task can run on a closed resource. ${AWAIT_ADVICE}.${EXCEPTION_ROUTE}`,
      returned: `This returns the promise without awaiting it, so the {{owner}} disposes {{name}} before the task finishes. Write return await ..., or ${AWAIT_ADVICE}.${EXCEPTION_ROUTE}`,
    },
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const reported = new Set();

    function check(entry) {
      for (const identifier of referencesIn(entry)) {
        const form = detachedForm(sourceCode, identifier, entry.region);
        if (form !== undefined && !reported.has(form.node)) {
          reported.add(form.node);
          context.report({
            node: form.node,
            messageId: form.messageId,
            data: { owner: entry.owner, name: entry.variable.name },
          });
        }
      }
    }

    return {
      VariableDeclaration(node) {
        for (const region of usingRegions(sourceCode, node)) {
          check(region);
        }
      },
      TryStatement(node) {
        for (const region of finallyRegions(sourceCode, node)) {
          check(region);
        }
      },
    };
  },
};
