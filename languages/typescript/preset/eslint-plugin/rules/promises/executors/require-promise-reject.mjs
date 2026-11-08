import { typeServices } from '../../security/security-values.mjs';
import { ignoredErrors } from './error-callbacks.mjs';
import { promiseExecutor } from './executor-sources.mjs';

const ALLOWED =
  "`new Promise((resolve, reject) => { source.once('error', reject); ... })`, or a form that rejects by itself: `once` from `node:events`, `pipeline` or `finished` from `node:stream/promises`, or `util.promisify`.";

const MESSAGES = {
  missingReject: `This promise settles only from {{source}}, but its executor never rejects, so when that event source or callback fails the promise stays pending and its caller waits forever. Take \`reject\` and wire the failure to it: ${ALLOWED}`,
  ignoredError: `This callback resolves the promise without checking its error argument \`{{name}}\`, so a failed \`{{callee}}\` resolves with missing data instead of rejecting. Branch on it first: \`if ({{name}}) { reject({{name}}); return; }\`, or use \`util.promisify\`, which rejects on the error by itself.`,
  resolvesWithError: `\`{{name}}\` is passed to \`{{callee}}\` as a callback whose first argument is an error, so a failure resolves the promise with the error as its value. Pass \`(error) => (error ? reject(error) : resolve())\`, or use \`util.promisify\`, which rejects on the error by itself.`,
};

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a rejection path in a `new Promise` executor that waits on events, streams or callbacks',
    },
    schema: [],
    messages: MESSAGES,
  },
  create(context) {
    const services = typeServices(context);
    return {
      NewExpression(construction) {
        const found = promiseExecutor(context, construction);
        if (found === undefined) {
          return;
        }
        const { executor, resolve, rejects, sources } = found;
        if (!rejects) {
          context.report({
            node: executor.params[1] ?? executor.params[0],
            messageId: 'missingReject',
            data: { source: sources[0].text },
          });
          return;
        }
        for (const finding of ignoredErrors(context, { sources, resolve, services })) {
          context.report(finding);
        }
      },
    };
  },
};
