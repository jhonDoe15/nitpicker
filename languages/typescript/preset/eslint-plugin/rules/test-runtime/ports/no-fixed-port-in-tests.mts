import { AST_NODE_TYPES, type TSESLint, type TSESTree } from '@typescript-eslint/utils';
import { constantNumber, propertyKeyName } from '../../analysis/test-code-analysis.mts';
import { ancestorsOf, nameOf } from '../../typed/node-views.mts';
import { isTestFunctionChain } from '../../../test-quality/test-calls.mts';
import { isExemptBinding } from './port-exemptions.mts';
import { TEST_HOOKS } from '../assertions/no-raised-test-timeout.mts';

type Context = Readonly<TSESLint.RuleContext<'fixedPort', []>>;

const WEB_SOCKET_NAMESPACES = new Set(['WebSocket', 'ws', 'WS']);
const PORT = 'port';

function isRunnerCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const { callee } = node;
  return (
    isTestFunctionChain(callee) ||
    (callee.type === AST_NODE_TYPES.Identifier && TEST_HOOKS.has(callee.name))
  );
}

function fixedPort(context: Context, node: TSESTree.Node | undefined): number | undefined {
  const value = node === undefined ? undefined : constantNumber(context, node);
  return value !== undefined && Number.isInteger(value) && value > 0 ? value : undefined;
}

function portOption(context: Context, node: TSESTree.Node | undefined): number | undefined {
  if (node?.type !== AST_NODE_TYPES.ObjectExpression) {
    return undefined;
  }
  const property = node.properties.find(
    (candidate): candidate is TSESTree.Property =>
      candidate.type === AST_NODE_TYPES.Property && propertyKeyName(candidate) === PORT,
  );
  return fixedPort(context, property?.value);
}

function listenPort(context: Context, node: TSESTree.CallExpression): number | undefined {
  const { callee } = node;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || nameOf(callee.property) !== 'listen') {
    return undefined;
  }
  const [first] = node.arguments;
  return fixedPort(context, first) ?? portOption(context, first);
}

function isWebSocketServer(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === 'WebSocketServer';
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    nameOf(callee.property) === 'Server' &&
    WEB_SOCKET_NAMESPACES.has(nameOf(callee.object) ?? '')
  );
}

function serverPort(context: Context, node: TSESTree.NewExpression): number | undefined {
  return isWebSocketServer(node.callee) ? portOption(context, node.arguments[0]) : undefined;
}

function report(context: Context, node: TSESTree.Node, port: number | undefined): void {
  const owners = ancestorsOf(node).filter(isRunnerCall);
  if (
    port !== undefined &&
    owners.length > 0 &&
    !isExemptBinding(context, node, { port, owners })
  ) {
    context.report({ node, messageId: 'fixedPort', data: { port: String(port) } });
  }
}

export const rule: TSESLint.RuleModule<'fixedPort'> = {
  meta: {
    type: 'problem',
    docs: { description: 'Start test servers on port 0 instead of a fixed port' },
    schema: [],
    messages: {
      fixedPort:
        'This test starts a server on port {{port}}, so it fails when that port is taken: by parallel test workers, a second run of the suite, a running app or a socket of the previous test still closing. Listen on port 0 and read the port the server got (`server.address().port`).',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        report(context, node, listenPort(context, node));
      },
      NewExpression(node) {
        report(context, node, serverPort(context, node));
      },
    };
  },
};
