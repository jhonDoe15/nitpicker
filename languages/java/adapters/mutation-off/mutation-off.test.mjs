import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyDisable, describeDisableCascade } from '../../../../core/configuration/config.mjs';
import { parseRunnerArguments } from '../../../../core/tooling/runner-arguments.mjs';
import { gradleStages } from '../gradle-wrapper/gradle-stages.mjs';
import { readOptions } from '../options/java-read-options.mjs';
import { createJavaAnalyzer } from '../java-analyzer.mjs';
import { configureJavaAnalyzer } from '../java-policy.mjs';
import { comparisonMutationPlan } from '../../builds/change-scope/mutation-plan.mjs';
import { withoutPitTools } from '../../maven/quick/maven-quick.mjs';

const HYGIENE = { name: 'hygiene' };
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('"disable": ["mutation"] with the java and kotlin presets', () => {
  it.each([false, true])('keeps the analyzer and accepts the name (kotlin: %s)', (kotlin) => {
    const analyzer = createJavaAnalyzer({ kotlin });
    const kept = applyDisable([analyzer, HYGIENE], { disable: ['mutation'] });

    expect(kept.map(({ name }) => name)).toEqual([analyzer.name, 'hygiene']);
  });

  it('still rejects a name that is neither an analyzer nor a part', () => {
    expect(() => applyDisable([createJavaAnalyzer(), HYGIENE], { disable: ['pit'] })).toThrow(
      /"disable" names unknown analyzers: pit/,
    );
    expect(() => applyDisable([HYGIENE], { disable: ['mutation'] })).toThrow(/unknown analyzers/);
  });

  it('says on the console that the config turned mutation off', () => {
    expect(
      describeDisableCascade([createJavaAnalyzer(), HYGIENE], { disable: ['mutation'] }),
    ).toEqual([
      'mutation is turned off by "disable", so java does not run it on the base or the head',
    ]);
  });

  it('adds --mutation off to the runner, in the configuration hash', () => {
    const analyzer = createJavaAnalyzer();
    const off = configureJavaAnalyzer(analyzer, { mutationOff: true });
    const { args } = off.createInvocation({ projectRoot: '.' });

    expect(args.slice(args.indexOf('--mutation'), args.indexOf('--mutation') + 2)).toEqual([
      '--mutation',
      'off',
    ]);
    expect(off.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      parseRunnerArguments(['--project-root', '.', '--mutation', 'off']).policy.mutationOff,
    ).toBe(true);
    expect(parseRunnerArguments(['--project-root', '.']).policy.mutationOff).toBeUndefined();
    expect(() => parseRunnerArguments(['--project-root', '.', '--mutation', 'on'])).toThrow(
      /--mutation must be: off/,
    );
  });

  it('reaches Gradle as a property and Maven as a tool set without PIT', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-mutation-off-'));
    roots.push(projectRoot);
    const [stage] = gradleStages([], {
      projectRoot,
      initScript: 'init.gradle',
      policy: { mutationOff: true },
      directory: path.join(projectRoot, 'gradle'),
    });
    const tools = {
      jacoco: [],
      pit: [],
      'pit-junit5': [],
      'pit-testng': [],
      'launcher-1.10.0': [],
      archunit: [],
    };

    expect(stage().filter((argument) => argument.startsWith('-Pnitpicker.mutation'))).toEqual([
      '-Pnitpicker.mutation=off',
    ]);
    expect(Object.keys(withoutPitTools(tools, true))).toEqual(['jacoco', 'archunit']);
    expect(withoutPitTools(tools, false)).toBe(tools);
    expect(readOptions({ mutationOff: true }).mutationOff).toBe(true);
  });

  it('plans no mutation of the changed code', () => {
    expect(comparisonMutationPlan('/p', { mutationOff: true, baselineRoot: '/q' })).toBeUndefined();
  });
});
