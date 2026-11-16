import type { TSESLint } from '@typescript-eslint/utils';
import { describeSubprocess } from '../../analysis/test-code-analysis.mts';
import { perTestSubprocessVisitors } from '../per-test-subprocess.mts';

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

export const rule: TSESLint.RuleModule<'nodeProcessPerTest'> = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      nodeProcessPerTest:
        'Do not start a Node process (process.execPath, node, npx or a node_modules/.bin script) from a test or beforeEach. Import the function and call it in-process; start the application as a process only through the AppProcess harness in the test fixtures. An exception fits only when this test checks the process boundary itself (exit codes, signals, stdout).',
    },
  },
  create(context) {
    return perTestSubprocessVisitors(context, 'nodeProcessPerTest', (node, bindings) =>
      NODE_COMMANDS.has(describeSubprocess(context, node, bindings)?.command ?? ''),
    );
  },
};
