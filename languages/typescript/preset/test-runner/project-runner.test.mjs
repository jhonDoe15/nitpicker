import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { policyTestRunner, projectTestRunner, recordedTestRunner } from './project-runner.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function project(scripts) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-runner-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }));
  return root;
}

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-runner-'));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  return root;
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

  it.each([{}, { tools: {} }, { tools: { tests: {} } }])('has nothing for %j', (policy) => {
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
