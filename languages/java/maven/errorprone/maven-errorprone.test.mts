import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { spawnResult } from '../../adapters/test-support/spawn-result.mts';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { processorOutput, runErrorProne, runnerFlags } from './maven-errorprone.mts';

const NOW = 1_000_000;
const LEVEL = { release: undefined, source: undefined, target: undefined };
const projectWith = useTempProjects('nitpicker-maven-errorprone-');

function contextFor(files: Readonly<Record<string, string>>, version: string) {
  const basedir = projectWith(files);
  const probes: string[] = [];
  const spawn: JavaSpawn = (command) => {
    probes.push(command);
    return spawnResult({ status: 0, stdout: '', stderr: version });
  };
  const context = {
    module: {
      basedir,
      outputDirectory: path.join(basedir, 'target/classes'),
      testOutputDirectory: path.join(basedir, 'target/test-classes'),
      sourceRoots: [path.join(basedir, 'src/main/java')],
      testSourceRoots: [],
      compiler: {},
    },
    reportDir: path.join(basedir, 'target/nitpicker'),
    tools: { errorprone: [] },
    classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
    configs: {},
    spawn,
    environment: { PATH: '' },
  };
  return { context, probes };
}

const MODULAR = {
  'src/main/java/module-info.java': 'module demo {}',
  'src/main/java/demo/A.java': 'package demo; class A {}',
};
const UNREADABLE = 'no version here';

describe('runErrorProne', () => {
  it('tries a modular project again on the class path once, and a plain one only once', () => {
    const modular = contextFor(MODULAR, UNREADABLE);
    const plain = contextFor(
      { 'src/main/java/demo/A.java': 'package demo; class A {}' },
      UNREADABLE,
    );

    expect(() => {
      runErrorProne(modular.context);
    }).toThrow(/could not read the version/u);
    expect(() => {
      runErrorProne(plain.context);
    }).toThrow(/could not read the version/u);
    expect(plain.probes).toHaveLength(1);
    expect(modular.probes).toHaveLength(2 * plain.probes.length);
  });

  it('skips a modular project without trying again when no JDK fits', () => {
    const { context, probes } = contextFor(MODULAR, 'openjdk version "11.0.2" 2019-01-15');

    runErrorProne(context);

    expect(probes).toHaveLength(3);
    expect(existsSync(path.join(context.reportDir, 'errorprone-skipped.txt'))).toBe(true);
    expect(readFileSync(path.join(context.reportDir, 'errorprone.json'), 'utf8')).toBe('[]\n');
  });
});

describe('runnerFlags', () => {
  it('runs a worker per tool slot on the memory of two slots, until half a minute before the limit', () => {
    expect(runnerFlags(600_000, { slots: 4, now: NOW })).toEqual([
      '-Dnitpicker.errorprone.workers=4',
      '-XX:MaxRAMPercentage=37.5',
      '-XX:GCTimeRatio=4',
      '-Dnitpicker.errorprone.deadline=1570000',
    ]);
  });

  it.each([[0], [30_000], [Number.POSITIVE_INFINITY]])(
    'leaves the deadline out for a limit of %d ms',
    (timeoutMs) => {
      expect(runnerFlags(timeoutMs, { slots: 1, now: NOW })).toEqual([
        '-Dnitpicker.errorprone.workers=1',
        '-XX:MaxRAMPercentage=75.0',
        '-XX:GCTimeRatio=4',
      ]);
    },
  );
});

describe('processorOutput', () => {
  const module = { basedir: '/work/app', outputDirectory: '/work/app/target/classes' };

  it("takes the compiler plugin's folders, relative ones from the module folder", () => {
    const compiler = {
      generatedSources: '/work/gen',
      test: { compilerArgs: [], ...LEVEL, generatedSources: 'gen-tests' },
    };

    expect(processorOutput(module, compiler, false)).toBe('/work/gen');
    expect(processorOutput(module, compiler, true)).toBe('/work/app/gen-tests');
  });

  it("falls back to Maven's default folders next to the class folder", () => {
    expect(processorOutput(module, { test: undefined }, false)).toBe(
      '/work/app/target/generated-sources/annotations',
    );
    expect(processorOutput(module, { test: undefined }, true)).toBe(
      '/work/app/target/generated-test-sources/test-annotations',
    );
  });
});
