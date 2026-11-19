import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { calleeName } from './leaving-calls.mts';

const LOGGERS = new Set(['log', 'warn', 'info', 'error', 'debug', 'trace', 'print', 'println']);
const WRITERS = new Set([
  'append',
  'push',
  'write',
  'writeln',
  'add',
  'set',
  'send',
  'emit',
  'put',
]);

function isPlainText(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.Literal ||
    (node.type === AST_NODE_TYPES.TemplateLiteral && node.expressions.length === 0)
  );
}

export function isPlaceholderCall(call: TSESTree.CallExpression): boolean {
  const name = calleeName(call);
  if (name === undefined) {
    return false;
  }
  if (LOGGERS.has(name)) {
    return true;
  }
  return WRITERS.has(name) && call.arguments.length > 0 && call.arguments.every(isPlainText);
}
