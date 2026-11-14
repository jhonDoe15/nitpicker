import path from 'node:path';

const fakeAnalyzerPath = path.join(
  import.meta.dirname,
  '../../diff/execution/test-support/fake-analyzer.mjs',
);

export function fakeAnalyzer(name = 'fake-quality-analyzer') {
  return {
    name,
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
    createInvocation({ projectRoot, policyRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          fakeAnalyzerPath,
          '--root',
          projectRoot,
          '--policy-root',
          policyRoot,
          '--tool-root',
          toolRoot,
        ],
        cwd: policyRoot,
      };
    },
  };
}

export function crashingAnalyzer() {
  return {
    ...fakeAnalyzer('crashing-analyzer'),
    createInvocation({ policyRoot }) {
      return {
        command: process.execPath,
        args: ['-e', 'process.exit(2)'],
        cwd: policyRoot,
      };
    },
  };
}
