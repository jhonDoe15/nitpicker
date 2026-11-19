import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';
import { parseJson, textOf } from '../../../../shared/values/readers.mts';
import { spawnResult } from '../../adapters/test-support/spawn-result.mts';
import type { JavaSpawn } from '../../adapters/typed/java-values.mts';
import { handWrittenClasses as listClasses } from './spotbugs-targets.mts';

const compile = () => '/helper-classes';
const handWrittenClasses = (options: Omit<Parameters<typeof listClasses>[0], 'compile'>) =>
  listClasses({ ...options, compile });

type Module = Parameters<typeof handWrittenClasses>[0]['module'];

type Probe = {
  readonly basedir: string;
  readonly invocations: string[][];
  readonly spawnWriting: (listed: string) => JavaSpawn;
  readonly moduleOf: (roots: string[]) => Module;
  readonly mkdirs: (...directories: string[]) => void;
};

describe('classes SpotBugs analyzes', () => {
  const { temporaryRoot } = useGitFixtures();

  function probeOf(): Probe {
    const basedir = temporaryRoot('nitpicker-spotbugs-targets-');
    const invocations: string[][] = [];
    const mkdirs = (...directories: string[]): void => {
      for (const directory of directories) {
        mkdirSync(path.join(basedir, directory), { recursive: true });
      }
    };
    mkdirs('report');
    return {
      basedir,
      invocations,
      mkdirs,
      spawnWriting: (listed) => (_command, args) => {
        const lines = readFileSync((args[0] ?? '').slice(1), 'utf8')
          .split('\n')
          .map((line) => textOf(parseJson(line)));
        const tokens = lines.slice(lines.indexOf('GeneratedClasses') + 1);
        invocations.push(tokens);
        writeFileSync(tokens[0] ?? '', listed);
        return spawnResult({ status: 0 });
      },
      moduleOf: (roots) => ({
        basedir,
        buildDirectory: path.join(basedir, 'target'),
        outputDirectory: path.join(basedir, 'target/classes'),
        sourceRoots: roots.map((root) => path.join(basedir, root)),
      }),
    };
  }

  it('lists the class files through a file, naming the generated and written roots', () => {
    const { basedir, invocations, mkdirs, moduleOf, spawnWriting } = probeOf();
    mkdirs(
      'src/main/java',
      'target/generated-sources/proto',
      'target/generated-sources/annotations',
    );
    const module = moduleOf(['src/main/java', 'target/generated-sources/proto']);

    const targets = handWrittenClasses({
      module,
      reportDir: path.join(basedir, 'report'),
      spawn: spawnWriting('/classes/Hand.class\n'),
    });

    expect(targets).toEqual({
      list: path.join(basedir, 'report/spotbugs-targets.txt'),
      empty: false,
    });
    const tokens = invocations[0]?.slice(1);
    expect(tokens?.filter((_, index) => index % 2 === 0)).toEqual([
      '--classes',
      '--generated',
      '--generated',
      '--written',
    ]);
    expect(tokens?.filter((_, index) => index % 2 === 1)).toEqual([
      module.outputDirectory,
      path.join(basedir, 'target/generated-sources/proto'),
      path.join(basedir, 'target/generated-sources/annotations'),
      path.join(basedir, 'src/main/java'),
    ]);
  });

  it('reports an empty list when every class comes from a generated source', () => {
    const { basedir, mkdirs, moduleOf, spawnWriting } = probeOf();
    mkdirs('target/generated-sources/proto');

    const targets = handWrittenClasses({
      module: moduleOf(['target/generated-sources/proto']),
      reportDir: path.join(basedir, 'report'),
      spawn: spawnWriting(''),
    });

    expect(targets?.empty).toBe(true);
  });

  it('does not filter a module without generated sources', () => {
    const { basedir, invocations, mkdirs, moduleOf, spawnWriting } = probeOf();
    mkdirs('src/main/java');

    expect(
      handWrittenClasses({
        module: moduleOf(['src/main/java']),
        reportDir: path.join(basedir, 'report'),
        spawn: spawnWriting(''),
      }),
    ).toBeUndefined();
    expect(invocations).toEqual([]);
  });

  it('does not treat a build directory that is the module as generated', () => {
    const { basedir, mkdirs, moduleOf, spawnWriting } = probeOf();
    mkdirs('src/main/java');

    expect(
      handWrittenClasses({
        module: { ...moduleOf(['src/main/java']), buildDirectory: basedir },
        reportDir: path.join(basedir, 'report'),
        spawn: spawnWriting(''),
      }),
    ).toBeUndefined();
  });
});
