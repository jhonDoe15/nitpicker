import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { temporaryTrees } from '../../test-support/temporary-trees.mts';
import { moduleManifest } from '../manifest/maven-manifest.mts';
import { type ModuleDescription, reactorModules } from '../typed/module-description.mts';

const trees = temporaryTrees('nitpicker-maven-kotlin-');

afterEach(trees.cleanup);

function moduleWith(build: string, directories: readonly string[]): ModuleDescription {
  const root = trees.tree({
    'pom.xml': '<project><groupId>demo</groupId><artifactId>shop</artifactId></project>',
  });
  for (const directory of directories) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  const pom = `<project><groupId>demo</groupId><artifactId>shop</artifactId><build>${build}</build></project>`;
  const [module] = reactorModules(root, pom);
  if (module === undefined) {
    throw new Error('The reactor has no module');
  }
  return module;
}

const kotlinPlugin = (sourceDirs: string[] = []): string =>
  '<plugins><plugin><groupId>org.jetbrains.kotlin</groupId>' +
  '<artifactId>kotlin-maven-plugin</artifactId><executions><execution>' +
  '<goals><goal>compile</goal></goals>' +
  (sourceDirs.length === 0
    ? ''
    : `<configuration><sourceDirs>${sourceDirs
        .map((directory) => `<sourceDir>${directory}</sourceDir>`)
        .join('')}</sourceDirs></configuration>`) +
  '</execution></executions></plugin></plugins>';

function relativeKotlinRoots(module: ModuleDescription): unknown {
  return moduleManifest({
    module,
    classpaths: { mainCompile: [], mainRuntime: [], testCompile: [], testRuntime: [] },
    pinned: {},
  })['kotlinSourceRoots'];
}

describe('Kotlin source roots of a Maven module', () => {
  it('compiles the Maven source roots when the plugin configures no sourceDirs', () => {
    const module = moduleWith(kotlinPlugin(), ['src/main/java', 'src/main/kotlin']);

    expect([module.kotlin?.sourceRoots, relativeKotlinRoots(module)]).toEqual([
      [path.join(module.basedir, 'src/main/java')],
      [],
    ]);
  });

  it('reads the sourceDirs of the compile execution, without the Java roots', () => {
    const module = moduleWith(kotlinPlugin(['src/main/kt', 'src/main/java']), [
      'src/main/java',
      'src/main/kt',
    ]);

    expect(relativeKotlinRoots(module)).toEqual(['src/main/kt']);
  });

  it('adds none without the Kotlin plugin, or for a directory that does not exist', () => {
    const plain = moduleWith('', ['src/main/kotlin']);
    const missing = moduleWith(kotlinPlugin(['src/main/kotlin']), ['src/main/java']);

    expect([relativeKotlinRoots(plain), relativeKotlinRoots(missing)]).toEqual([[], []]);
  });
});
