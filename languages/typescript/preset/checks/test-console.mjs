import { MINUTE_MS, vitestVersion } from './constants.mjs';

export function testConsoleCheckFor(exclusions) {
  return {
    name: 'test-console',
    kind: 'test-console',
    version: vitestVersion,
    exclusions: exclusions.general,
    dependencies: ['coverage'],
    shardWeight: 1,
    timeoutMs: MINUTE_MS,
    configurationFiles: [
      'languages/typescript/adapters/quality-areas/reporting/console/console-findings.mjs',
      'languages/typescript/adapters/quality-areas/reporting/console/console-messages.mjs',
      'languages/typescript/adapters/quality-areas/reporting/test-report.mjs',
      'languages/typescript/adapters/quality-areas/runners/console/test-console.mjs',
      'languages/typescript/adapters/quality-areas/runners/tests.mjs',
      'languages/typescript/adapters/quality-areas/runners/tooling.mjs',
      'languages/typescript/adapters/test-runners/test-console-run.mjs',
      'languages/typescript/preset/head-policy.mjs',
      'languages/typescript/preset/test-console/ansi.mjs',
      'languages/typescript/preset/test-console/console-capture.mjs',
      'languages/typescript/preset/test-console/console-report.mjs',
      'languages/typescript/preset/test-console/runners/jest-reporter.config.mjs',
      'languages/typescript/preset/test-console/runners/jest-reporter.mjs',
      'languages/typescript/preset/test-console/runners/mocha-capture.mjs',
      'languages/typescript/preset/test-console/runners/mocha-hooks.config.mjs',
      'languages/typescript/preset/test-console/runners/node-test-capture.mjs',
      'languages/typescript/preset/test-console/runners/node-test-preload.config.cjs',
      'languages/typescript/preset/test-console/vitest-reporter.config.mjs',
      'shared/glob.mjs',
      'shared/policy.mjs',
      'shared/rules/finding-helpers.mjs',
      'shared/rules/exceptions.mjs',
    ],
  };
}
