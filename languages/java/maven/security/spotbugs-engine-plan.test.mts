import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import { compilerOf } from '../compile-sets/compiler-types.mts';
import { spotbugsEngineArguments, spotbugsEnginePlan } from './spotbugs-engine-plan.mts';

const projectWith = useTempProjects('nitpicker-spotbugs-maven-');

function moduleIn(...compiled: readonly string[]) {
  const root = projectWith({});
  const source = path.join(root, 'src/main/java');
  const classes = path.join(root, 'target/classes');
  for (const name of ['p/A', 'p/B', 'p/package-info']) {
    mkdirSync(path.dirname(path.join(source, name)), { recursive: true });
    writeFileSync(path.join(source, `${name}.java`), '');
  }
  for (const name of compiled) {
    mkdirSync(path.dirname(path.join(classes, name)), { recursive: true });
    writeFileSync(path.join(classes, `${name}.class`), '');
  }
  return {
    root,
    module: {
      basedir: root,
      sourceRoots: [source, path.join(root, 'missing')],
      outputDirectory: classes,
      compiler: {},
    },
  };
}

describe('spotbugsEnginePlan', () => {
  it('hands the engine every Java source javac compiled', () => {
    const { root, module } = moduleIn('p/A', 'p/B');

    const plan = spotbugsEnginePlan({
      module,
      reportDir: '/r',
      compiler: compilerOf({}),
      compileClasspath: ['/lib/a.jar'],
      auxiliary: ['/build/other/classes'],
      javaHome: '/jdk',
    });

    expect(plan).toStrictEqual({
      reportDir: '/r',
      sources: ['A', 'B', 'package-info'].map((name) =>
        path.join(root, `src/main/java/p/${name}.java`),
      ),
      classpath: ['/build/other/classes'],
      processorPath: ['/lib/a.jar'],
      javaHome: '/jdk',
    });
  });

  it('leaves SpotBugs every pattern when a source was not compiled or processors are declared', () => {
    const options = { reportDir: '/r', compileClasspath: [], auxiliary: [], javaHome: '/jdk' };
    const skipped = moduleIn('p/A');
    const compiled = moduleIn('p/A', 'p/B');

    expect(
      spotbugsEnginePlan({ ...options, module: skipped.module, compiler: compilerOf({}) }),
    ).toBeUndefined();
    expect(
      spotbugsEnginePlan({
        ...options,
        module: compiled.module,
        compiler: compilerOf({ processorPaths: ['org.example:processor:1'] }),
      }),
    ).toBeUndefined();
    expect(
      spotbugsEnginePlan({
        ...options,
        module: compiled.module,
        compiler: compilerOf({ compilerArgs: ['-processorpath', '/lib/processor.jar'] }),
      }),
    ).toBeUndefined();
    expect(
      spotbugsEnginePlan({
        ...options,
        module: compiled.module,
        compileClasspath: ['/lib/a.jar'],
        compiler: compilerOf({ proc: 'none', processorPaths: ['org.example:processor:1'] }),
      })?.processorPath,
    ).toStrictEqual([]);
  });

  it('runs the engine past an empty processor folder but not past generated sources', () => {
    const options = { reportDir: '/r', compileClasspath: [], auxiliary: [], javaHome: '/jdk' };
    const { root, module } = moduleIn('p/A', 'p/B');
    const output = path.join(root, 'target/generated-sources/annotations');
    mkdirSync(path.join(output, 'p'), { recursive: true });

    expect(spotbugsEnginePlan({ ...options, module, compiler: compilerOf({}) })).toStrictEqual({
      reportDir: '/r',
      sources: ['A', 'B', 'package-info'].map((name) =>
        path.join(root, `src/main/java/p/${name}.java`),
      ),
      classpath: [],
      processorPath: [],
      javaHome: '/jdk',
    });
    writeFileSync(path.join(output, 'p/G.java'), '');
    expect(spotbugsEnginePlan({ ...options, module, compiler: compilerOf({}) })).toBeUndefined();
  });

  it('does not start the engine without an environment', () => {
    const { module } = moduleIn('p/A', 'p/B');

    expect(
      spotbugsEngineArguments({ module, reportDir: '/nonexistent', auxiliary: [] }, undefined),
    ).toStrictEqual([]);
  });
});
