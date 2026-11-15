import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectTestRunner } from './project-runner.mts';
import { policyTestRunner as untypedPolicyTestRunner } from './policy-runner.mjs';
import { recordedTestRunner as untypedRecordedTestRunner } from './vocabulary/runner-vocabulary.mjs';
import {
  headPolicyEnvironment,
  withHeadPolicyFile,
} from '../structure/test-support/policy-views.mts';
import { useTemporaryProjects } from '../test-support/temporary-projects.mts';

const policyTestRunner: (policy: object, projectRoot: string) => string = untypedPolicyTestRunner;
const recordedTestRunner: (policy: object) => string | undefined = untypedRecordedTestRunner;

const { projectWith: filesIn } = useTemporaryProjects('nitpicker-project-runner-');

afterEach(() => {
  vi.unstubAllEnvs();
});

function projectWith(manifest: object): string {
  return filesIn({ 'package.json': JSON.stringify(manifest) });
}

function project(scripts: Record<string, string>): string {
  return projectWith({ scripts });
}

describe('the test runner nitpicker runs for a snapshot', () => {
  it('takes the runner and the test command from the live project for both snapshots', () => {
    const base = project({ test: 'jest --ci' });
    const live = project({ test: 'tsc && vitest run --project unit' });

    expect(projectTestRunner({ projectRoot: base, runnerProjectRoot: live })).toEqual({
      runner: 'vitest',
      evidence: 'package.json script "test"',
      command: {
        environment: {},
        nodeArguments: [],
        arguments_: ['run', '--project', 'unit'],
        precedingCommands: ['tsc'],
      },
    });
  });

  it('takes the runner and the command from the snapshot when its policy names its own runner', () => {
    const base = project({ test: 'jest --ci' });
    const live = project({ test: 'vitest run' });
    const policy = { tools: { tests: { detectedRunner: 'vitest', snapshotRunner: 'jest' } } };

    const detected = withHeadPolicyFile(policy, (policyFile) => {
      for (const [name, value] of Object.entries(headPolicyEnvironment(policyFile))) {
        vi.stubEnv(name, value ?? '');
      }
      return projectTestRunner({ projectRoot: base, runnerProjectRoot: live });
    });

    expect(detected).toEqual({
      runner: 'jest',
      evidence: 'nitpicker.config.json "tools.tests.runner"',
      command: { environment: {}, nodeArguments: [], arguments_: ['--ci'], precedingCommands: [] },
    });
  });

  it('reads the snapshot itself when no live project is named', () => {
    const root = project({ test: 'echo none' });
    const expected = {
      runner: 'vitest',
      evidence: 'the default',
      command: { environment: {}, nodeArguments: [], arguments_: [], precedingCommands: [] },
    };

    expect(projectTestRunner({ projectRoot: root })).toEqual(expected);
  });
});

describe('recordedTestRunner', () => {
  it('prefers the configured runner over the detected one', () => {
    expect(
      recordedTestRunner({ tools: { tests: { runner: 'mocha', detectedRunner: 'jest' } } }),
    ).toBe('mocha');
  });

  it('falls back to the runner the head checkout was detected to use', () => {
    expect(recordedTestRunner({ tools: { tests: { detectedRunner: 'node' } } })).toBe('node');
  });

  it.each([{}, { tools: {} }, { tools: { tests: {} } }])('has nothing for %j', (policy: object) => {
    expect(recordedTestRunner(policy)).toBeUndefined();
  });
});

describe('policyTestRunner', () => {
  it('uses the recorded runner without reading the project', () => {
    const policy = { tools: { tests: { detectedRunner: 'jest' } } };

    expect(policyTestRunner(policy, '/does/not/exist')).toBe('jest');
  });

  it('detects the runner from the project when the policy records none', () => {
    const root = projectWith({ scripts: { test: 'mocha' } });

    expect(policyTestRunner({}, root)).toBe('mocha');
  });

  it('defaults to vitest for a project that shows no runner', () => {
    expect(policyTestRunner({}, projectWith({}))).toBe('vitest');
  });
});
