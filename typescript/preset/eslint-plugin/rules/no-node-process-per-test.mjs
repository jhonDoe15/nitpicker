import { describeSubprocess, perTestVisitors, subprocessBindings } from './test-code-analysis.mjs';

const NODE_COMMANDS = new Set([
  'node',
  'package-bin',
  'npx',
  'npm',
  'pnpm',
  'yarn',
  'bunx',
  'tsx',
  'ts-node',
]);

export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      nodeProcessPerTest:
        'Do not start a Node process (process.execPath, node, npx or a node_modules/.bin script) from a test or beforeEach. Import the function and call it in-process; start the application as a process only through the AppProcess harness in the test fixtures.',
    },
  },
  create(context) {
    let bindings = { named: new Map(), namespaces: new Set() };
    return {
      Program(node) {
        bindings = subprocessBindings(node);
      },
      ...perTestVisitors(context, (node) => {
        if (node.type !== 'CallExpression') return undefined;
        const described = describeSubprocess(context, node, bindings);
        return NODE_COMMANDS.has(described?.command ?? '')
          ? { messageId: 'nodeProcessPerTest' }
          : undefined;
      }),
    };
  },
};
