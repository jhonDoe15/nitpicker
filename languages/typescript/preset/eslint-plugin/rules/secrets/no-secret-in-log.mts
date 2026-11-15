import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { dottedName, memberName, unwrapped } from './secret-nodes.mts';
import { secretOperands } from './secret-operands.mts';

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

function loggerOwner(owner: TSESTree.Node): boolean {
  const name = unwrapped(owner);
  if (name.type === AST_NODE_TYPES.Identifier) {
    return LOGGER_NAME.test(name.name);
  }
  return name.type === AST_NODE_TYPES.MemberExpression && LOGGER_NAME.test(memberName(name) ?? '');
}

function isLogCall(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  const method = memberName(callee);
  if (STREAMS.has(dottedName(callee.object) ?? '')) {
    return method === 'write';
  }
  return LOG_METHODS.has(method ?? '') && loggerOwner(callee.object);
}

function isErrorConstruction(node: TSESTree.NewExpression): boolean {
  const name = dottedName(node.callee)?.split('.').at(-1);
  return name !== undefined && ERROR_TYPE.test(name);
}

export const rule: TSESLint.RuleModule<'secretInLog'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow secrets passed to a log call or an error message' },
    schema: [],
    messages: {
      secretInLog: 'Log that {{ name }} is set, or a masked tail, instead of the secret itself.',
    },
  },
  create(context) {
    function check(node: TSESTree.CallExpression | TSESTree.NewExpression): void {
      for (const argument of node.arguments) {
        for (const operand of secretOperands(argument)) {
          const name = context.sourceCode.getText(
            operand.type === AST_NODE_TYPES.Property ? operand.key : operand,
          );
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
