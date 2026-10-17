import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from '../java-analyzer.mjs';
import { configureJavaAnalyzer, validateJavaConfig } from '../java-policy.mjs';
import { parseRunnerArguments } from '../java-runner.mjs';

const ALLOW = [{ contains: 'deprecated driver', paths: ['src/test/**'], reason: 'vendor' }];

function context() {
  return {
    projectRoot: '/p',
    toolRoot: '/t',
    snapshot: 'head',
    projectPolicyRoot: tmpdir(),
    baselineRoot: tmpdir(),
  };
}

describe('the test console allow list in the Java policy', () => {
  it('hands the allow list to the runner and changes the hash', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      testConsole: { allow: ALLOW },
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.testConsoleAllow).toEqual(ALLOW);
    expect(configured.configurationHash).not.toBe(createJavaAnalyzer().configurationHash);
  });

  it('rejects an allow list argument that is not a JSON array', () => {
    expect(() =>
      parseRunnerArguments(['--project-root', '/p', '--test-console-allow', '{}']),
    ).toThrow('--test-console-allow must be a JSON array');
  });

  it.each(['java', 'kotlin'])('accepts testConsole with the %s preset', (preset) => {
    const testConsole = { allow: [{ contains: 'deprecated driver', reason: 'vendor' }] };

    expect(() => {
      validateJavaConfig({ preset, testConsole });
    }).not.toThrow();
  });
});
