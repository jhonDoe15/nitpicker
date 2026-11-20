import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { gradleStages } from './gradle-stages.mts';
import { BUILD_TIMEOUT_SCALE, gradleBudget, mavenBudget } from './gradle-budget.mts';
import { createJavaAnalyzer } from '../java-analyzer.mts';
import { parseJavaRunnerArguments } from '../java-policy.mts';
import type { JavaPolicy } from '../typed/java-values.mts';
import type { JavaBudget } from '../typed/java-run-options.mts';

const { temporaryRoot } = useGitFixtures();

afterEach(() => {
  vi.useRealTimers();
});

function stageArguments(policy: JavaPolicy, prefix: string, budget?: JavaBudget): string[] {
  const root = temporaryRoot('nitpicker-gradle-stages-');
  const [stage] = gradleStages([], {
    projectRoot: root,
    initScript: 'init.gradle',
    policy,
    directory: `${root}/tool-config`,
    testsSkipped: false,
    budget,
  });
  return (stage?.() ?? []).filter((argument) => argument.startsWith(prefix));
}

function scopeProperties(policy: JavaPolicy): string[] {
  return stageArguments(policy, '-Pnitpicker.mutationScope=');
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

    expect(policy['mutationScope']).toEqual(['src/main/java/shop/orders']);
    expect(
      JSON.parse(readFileSync((property ?? '').split('=').slice(1).join('='), 'utf8')),
    ).toEqual(['src/main/java/shop/orders']);
  });

  it('passes nothing without a scope', () => {
    const invocation = createJavaAnalyzer().createInvocation({ projectRoot: '/p', toolRoot: '/t' });

    expect(invocation.args).not.toContain('--mutation-scope');
    expect(scopeProperties({})).toEqual([]);
  });
});

describe('the changed files of a Gradle run', () => {
  function changedFilesProperty(policy: JavaPolicy): string[] {
    return stageArguments(policy, '-Pnitpicker.changedFiles=');
  }

  it('reach Gradle as a file of paths, so the init script can skip unaffected projects', () => {
    const [property] = changedFilesProperty({ changedFiles: ['core/src/Core.java'] });

    expect(
      JSON.parse(readFileSync((property ?? '').split('=').slice(1).join('='), 'utf8')),
    ).toEqual(['core/src/Core.java']);
  });

  it('are not passed when the change is unknown', () => {
    expect(changedFilesProperty({})).toEqual([]);
  });
});

describe('the PIT deadline of a Gradle run', () => {
  function deadlineProperties(budget: JavaBudget | undefined): string[] {
    return stageArguments({}, '-Pnitpicker.pit.deadline=', budget);
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

describe('the deadline of a build command', () => {
  const MINUTE_MS = 60_000;

  it('is 15 minutes and grows with the size allowance the run was given', () => {
    const allowance = { NITPICKER_ANALYZER_SIZE_ALLOWANCE_MS: String(40 * MINUTE_MS) };

    expect(gradleBudget({})).toEqual({
      commandTimeoutMs: 15 * MINUTE_MS,
      analyzerTimeoutMs: 31 * MINUTE_MS,
    });
    expect(gradleBudget(allowance)).toEqual({
      commandTimeoutMs: 35 * MINUTE_MS,
      analyzerTimeoutMs: 71 * MINUTE_MS,
    });
    expect(mavenBudget(allowance).commandTimeoutMs).toBe(35 * MINUTE_MS);
  });

  it('keeps a configured number of minutes whatever the size', () => {
    const environment = {
      NITPICKER_ANALYZER_SIZE_ALLOWANCE_MS: String(40 * MINUTE_MS),
      NITPICKER_GRADLE_TIMEOUT_MINUTES: '5',
    };

    expect(gradleBudget(environment).commandTimeoutMs).toBe(5 * MINUTE_MS);
  });

  it('scales the analyzer by source files and build files, for both stages of a run', () => {
    expect(createJavaAnalyzer().timeoutScale).toEqual(BUILD_TIMEOUT_SCALE);
    expect(BUILD_TIMEOUT_SCALE).toEqual({
      perThousandFilesMs: 4 * MINUTE_MS,
      extensions: ['java', 'kt'],
      perModuleMs: MINUTE_MS,
      moduleFiles: ['build.gradle', 'build.gradle.kts', 'pom.xml'],
    });
  });
});
