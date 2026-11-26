import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compilerOf } from './compiler-types.mts';
import { compileSets } from './compile-sets.mts';
import { javaFiles } from '../maven-lint.mts';

const created: string[] = [];

afterEach(() => {
  created.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

function moduleWith(files: readonly string[]): { basedir: string; main: string } {
  const basedir = mkdtempSync(path.join(tmpdir(), 'nitpicker-compile-sets-'));
  created.push(basedir);
  const main = path.join(basedir, 'src', 'main', 'java');
  files.forEach((file) => {
    mkdirSync(path.dirname(path.join(main, file)), { recursive: true });
    writeFileSync(path.join(main, file), 'class A {}');
  });
  return { basedir, main };
}

describe('compileSets', () => {
  it('compiles an excluded file only in the extra execution that includes it, at that execution level', () => {
    const { basedir, main } = moduleWith(['demo/A.java', 'demo/jwk/EdEcKeys.java', 'demo/B.java']);
    const compiler = compilerOf({
      release: '8',
      sources: { includes: [], excludes: ['demo/jwk/EdEcKeys.java'] },
      executions: [
        {
          id: 'compile java15',
          release: '15',
          sources: { includes: ['**/jwk/*.java'], excludes: [] },
        },
        { id: 'again', release: '17', sources: { includes: [], excludes: [] } },
      ],
    });
    const module = {
      basedir,
      outputDirectory: path.join(basedir, 'target', 'classes'),
      testOutputDirectory: path.join(basedir, 'target', 'test-classes'),
      sourceRoots: [main],
      testSourceRoots: [path.join(basedir, 'src', 'test', 'java')],
      compiler,
    };

    const sets = compileSets(
      {
        module,
        classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
        files: { main: javaFiles(module.sourceRoots), test: [] },
      },
      compiler,
      false,
    );

    expect(
      sets.map((set) => [
        set.name,
        set.compiler.release,
        set.sources.map((file) => path.relative(main, file).replaceAll(path.sep, '/')),
      ]),
    ).toEqual([
      ['main', '8', ['demo/A.java', 'demo/B.java']],
      ['main-1-compile-java15', '15', ['demo/jwk/EdEcKeys.java']],
      ['main-2-again', '17', []],
      ['test', '8', []],
    ]);
  });

  it('compiles the main set as a plain compile when the default compile excludes module-info.java', () => {
    const { basedir, main } = moduleWith(['module-info.java', 'demo/A.java']);
    const compiler = compilerOf({
      release: '8',
      sources: { includes: [], excludes: ['module-info.java'] },
      executions: [
        { id: 'java9', release: '9', sources: { includes: ['module-info.java'], excludes: [] } },
      ],
    });
    const module = {
      basedir,
      outputDirectory: path.join(basedir, 'target', 'classes'),
      testOutputDirectory: path.join(basedir, 'target', 'test-classes'),
      sourceRoots: [main],
      testSourceRoots: [],
      compiler,
    };

    const sets = compileSets(
      {
        module,
        classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
        files: { main: javaFiles(module.sourceRoots), test: [] },
      },
      compiler,
      true,
    );

    expect(sets.map((set) => [set.name, set.modular, set.sources.length])).toEqual([
      ['main', false, 1],
      ['main-1-java9', false, 0],
      ['test', false, 0],
    ]);
  });
});
