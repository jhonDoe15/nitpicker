import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { gradleStages } from './gradle-stages.mjs';
import { createJavaAnalyzer } from '../java-analyzer.mjs';
import { parseJavaRunnerArguments } from '../java-policy.mjs';

const roots = [];

afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function scopeProperties(policy) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-stages-'));
  roots.push(root);
  const directory = path.join(root, 'tool-config');
  const [stage] = gradleStages([], {
    projectRoot: root,
    initScript: 'init.gradle',
    policy,
    directory,
  });
  return stage().filter((argument) => argument.startsWith('-Pnitpicker.mutationScope='));
}

describe('the mutation scope of a Gradle run', () => {
  it('reaches the runner and then Gradle as a file of paths', () => {
    const invocation = createJavaAnalyzer().createInvocation({
      projectRoot: '/project',
      toolRoot: '/tool',
      mutationScope: ['src/main/java/shop/orders'],
    });
    const { policy } = parseJavaRunnerArguments(invocation.args.slice(1));
    const [property] = scopeProperties(policy);

    expect(policy.mutationScope).toEqual(['src/main/java/shop/orders']);
    expect(JSON.parse(readFileSync(property.split('=').slice(1).join('='), 'utf8'))).toEqual([
      'src/main/java/shop/orders',
    ]);
  });

  it('passes nothing without a scope', () => {
    const invocation = createJavaAnalyzer().createInvocation({ projectRoot: '/p', toolRoot: '/t' });

    expect(invocation.args).not.toContain('--mutation-scope');
    expect(scopeProperties({})).toEqual([]);
  });
});

describe('the changed files of a Gradle run', () => {
  function changedFilesProperty(policy) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-stages-'));
    roots.push(root);
    const [stage] = gradleStages([], {
      projectRoot: root,
      initScript: 'init.gradle',
      policy,
      directory: path.join(root, 'tool-config'),
    });
    return stage().filter((argument) => argument.startsWith('-Pnitpicker.changedFiles='));
  }

  it('reach Gradle as a file of paths, so the init script can skip unaffected projects', () => {
    const [property] = changedFilesProperty({ changedFiles: ['core/src/Core.java'] });

    expect(JSON.parse(readFileSync(property.split('=').slice(1).join('='), 'utf8'))).toEqual([
      'core/src/Core.java',
    ]);
  });

  it('are not passed when the change is unknown', () => {
    expect(changedFilesProperty({})).toEqual([]);
  });
});

describe('the PIT deadline of a Gradle run', () => {
  function deadlineProperties(budget) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-gradle-stages-'));
    roots.push(root);
    const [stage] = gradleStages([], {
      projectRoot: root,
      initScript: 'init.gradle',
      policy: {},
      directory: path.join(root, 'tool-config'),
      budget,
    });
    return stage().filter((argument) => argument.startsWith('-Pnitpicker.pit.deadline='));
  }

  it('is passed as an epoch time one report overhead before the command limit', () => {
    const now = 1_700_000_000_000;
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const [property] = deadlineProperties({ commandTimeoutMs: 10 * 60_000 });

    expect(property).toBe(`-Pnitpicker.pit.deadline=${String(now + 9 * 60_000)}`);
  });

  it('is cut to the analyzer deadline', () => {
    const [property] = deadlineProperties({ commandTimeoutMs: 600_000, pitDeadlineMs: 12_345 });

    expect(property).toBe('-Pnitpicker.pit.deadline=12345');
  });

  it('is not passed without a budget', () => {
    expect(deadlineProperties(undefined)).toEqual([]);
  });
});
