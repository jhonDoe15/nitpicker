import { dottedName, memberName, unwrapped } from './secret-nodes.mjs';
import { secretOperands } from './secret-operands.mjs';

const LOG_METHODS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'warning',
  'error',
  'fatal',
  'log',
  'verbose',
  'silly',
  'notice',
  'critical',
  'child',
]);
const LOGGER_NAME = /^(?:console|logger|log|logging|winston|pino|bunyan|consola|signale)$|Logger$/i;
const ERROR_TYPE = /(?:Error|Exception)$/;
const STREAMS = new Set(['process.stdout', 'process.stderr']);

function loggerOwner(owner) {
  const name = unwrapped(owner);
  if (name.type === 'Identifier') {
    return LOGGER_NAME.test(name.name);
  }
  return name.type === 'MemberExpression' && LOGGER_NAME.test(memberName(name) ?? '');
}

function isLogCall(call) {
  const callee = unwrapped(call.callee);
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const method = memberName(callee);
  if (STREAMS.has(dottedName(callee.object) ?? '')) {
    return method === 'write';
  }
  return LOG_METHODS.has(method ?? '') && loggerOwner(callee.object);
}

function isErrorConstruction(node) {
  const name = dottedName(node.callee)?.split('.').at(-1);
  return name !== undefined && ERROR_TYPE.test(name);
}

export const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow secrets passed to a log call or an error message' },
    schema: [],
    messages: {
      secretInLog: 'Log that {{ name }} is set, or a masked tail, instead of the secret itself.',
    },
  },
  create(context) {
    function check(node) {
      for (const argument of node.arguments) {
        for (const operand of secretOperands(argument)) {
          const name = context.sourceCode.getText(operand.key ?? operand);
          context.report({
            node: operand,
            messageId: 'secretInLog',
            data: { name: `\`${name}\`` },
          });
        }
      }
    }

    return {
      CallExpression(node) {
        if (isLogCall(node)) {
          check(node);
        }
      },
      NewExpression(node) {
        if (isErrorConstruction(node)) {
          check(node);
        }
      },
    };
  },
};
