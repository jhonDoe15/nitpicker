import { createHandlerReader } from './catch-handling.mjs';

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a catch clause to handle the failure, not only log it, return a default or carry on',
    },
    schema: [],
    messages: {
      silent:
        "This catch swallows the error: it only logs it, returns a default, or carries on. Rethrow it as an Error subclass with `{ cause: error }`, return a failure result (`return { kind: 'malformed-json' }`), or collect it for the caller (`errors.push(error)`); logging alone is not handling. In a test, use `expect(() => run()).toThrow()` or `await expect(promise).rejects.toThrow()`. If it is intended, add an exception for nitpicker/no-silent-catch in nitpicker.config.json.",
    },
  },
  create(context) {
    const handles = createHandlerReader(context.sourceCode);

    return {
      CatchClause(node) {
        if (!handles(node)) {
          context.report({ node, messageId: 'silent' });
        }
      },
    };
  },
};
