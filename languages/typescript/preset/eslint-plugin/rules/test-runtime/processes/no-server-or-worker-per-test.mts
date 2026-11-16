import { AST_NODE_TYPES, type TSESLint } from '@typescript-eslint/utils';
import type { ModuleBindings } from '../../analysis/subprocess-calls.mts';
import {
  importedCalleeName,
  moduleBindings,
  perTestVisitors,
} from '../../analysis/test-code-analysis.mts';

const SERVER_MODULES = new Set(
  ['http', 'https', 'http2', 'net', 'tls'].flatMap((name) => [name, `node:${name}`]),
);
const WORKER_MODULES = new Set(['worker_threads', 'node:worker_threads']);
const SERVER_PER_TEST = 'serverPerTest';
const SERVER_FACTORIES = new Set(['createServer', 'createSecureServer']);

export const rule: TSESLint.RuleModule<'serverPerTest'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      serverPerTest:
        'Do not start a server or worker thread in each test or beforeEach. Start it once in beforeAll and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests. An exception fits only when each test needs a fresh server.',
    },
  },
  create(context) {
    let servers: ModuleBindings = { named: new Map(), namespaces: new Set() };
    let workers: ModuleBindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        servers = moduleBindings(node, SERVER_MODULES);
        workers = moduleBindings(node, WORKER_MODULES);
      },
      ...perTestVisitors(context, (node) => {
        const name = importedCalleeName(
          node.callee,
          node.type === AST_NODE_TYPES.NewExpression ? workers : servers,
        );
        if (node.type === AST_NODE_TYPES.CallExpression && SERVER_FACTORIES.has(name ?? '')) {
          return { messageId: SERVER_PER_TEST };
        }
        if (node.type === AST_NODE_TYPES.NewExpression && name === 'Worker') {
          return { messageId: SERVER_PER_TEST };
        }
        if (
          node.type === AST_NODE_TYPES.NewExpression &&
          importedCalleeName(node.callee, servers) === 'Server'
        ) {
          return { messageId: SERVER_PER_TEST };
        }
        return undefined;
      }),
    };
  },
};
