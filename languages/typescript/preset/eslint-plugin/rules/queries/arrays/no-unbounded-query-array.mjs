import { unwrapped } from '../../security/security-values.mjs';
import { queryScope } from '../query-chains.mjs';
import { isBounded, isRuntimeArray } from './array-bounds.mjs';
import { arraySink, IN } from './array-sinks.mjs';

const NAME_LENGTH = 30;
const LIMIT =
  'PostgreSQL takes at most 65,535 bound parameters in one statement, so the query works in tests and fails on a large account';
const EXCEPTION =
  'An exception fits only an array that its callers bound, such as a request field with a maximum length.';

function arrayName(context, node) {
  const text = context.sourceCode.getText(unwrapped(node));
  return text.length > NAME_LENGTH || text.includes('\n') ? 'this array' : text;
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a runtime array expanded into an SQL in list or multi-row insert with no empty check, size check or chunking',
    },
    schema: [],
    messages: {
      inList: `{{name}} goes into the in list as one bound parameter per element: an empty array renders in (), a syntax error, and ${LIMIT}. Return early when it is empty and send the whole array as one parameter (sql\`id = any(\${ids}::uuid[])\`), or split it with the project's chunking helper. ${EXCEPTION}`,
      insertRows: `{{name}} is inserted as one multi-row statement that spends a bound parameter on every column of every row: an empty array fails, and ${LIMIT}. Return early when it is empty and insert in chunks with the project's chunking helper (for (const rows of chunk(items, 1000))). ${EXCEPTION}`,
    },
  },
  create(context) {
    const scope = queryScope(context);
    return {
      CallExpression(node) {
        const sink = arraySink(scope, node);
        if (sink === undefined || sink.array === undefined) {
          return;
        }
        const needsEvidence = sink.kind !== IN;
        if (!isRuntimeArray(context, sink.array, { needsEvidence }) || isBounded(context, node, sink.array)) {
          return;
        }
        context.report({
          node: sink.array,
          messageId: sink.kind === IN ? 'inList' : 'insertRows',
          data: { name: arrayName(context, sink.array) },
        });
      },
    };
  },
};
