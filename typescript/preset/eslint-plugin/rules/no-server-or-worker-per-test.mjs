import { importedCalleeName, moduleBindings, perTestVisitors } from './test-code-analysis.mjs';

const SERVER_MODULES = new Set(
  ['http', 'https', 'http2', 'net', 'tls'].flatMap((name) => [name, `node:${name}`]),
);
const WORKER_MODULES = new Set(['worker_threads', 'node:worker_threads']);
const SERVER_FACTORIES = new Set(['createServer', 'createSecureServer']);

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      serverPerTest:
        'Do not start a server or worker thread in each test or beforeEach. Start it once in beforeAll and reset its state between tests, or test the logic against an in-memory implementation and keep the real transport for transport tests.',
    },
  },
  create(context) {
    let servers = { named: new Map(), namespaces: new Set() };
    let workers = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        servers = moduleBindings(node, SERVER_MODULES);
        workers = moduleBindings(node, WORKER_MODULES);
      },
      ...perTestVisitors(context, (node) => {
        const name = importedCalleeName(
          node.callee,
          node.type === 'NewExpression' ? workers : servers,
        );
        if (node.type === 'CallExpression' && SERVER_FACTORIES.has(name ?? '')) {
          return { messageId: 'serverPerTest' };
        }
        if (node.type === 'NewExpression' && name === 'Worker') {
          return { messageId: 'serverPerTest' };
        }
        if (
          node.type === 'NewExpression' &&
          importedCalleeName(node.callee, servers) === 'Server'
        ) {
          return { messageId: 'serverPerTest' };
        }
        return undefined;
      }),
    };
  },
};
