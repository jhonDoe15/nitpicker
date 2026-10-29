import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleManifest } from '../manifest/maven-manifest.mjs';
import { readReactor } from '../maven-project.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function moduleWith(build, directories) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-kotlin-'));
  roots.push(root);
  writeFileSync(
    path.join(root, 'pom.xml'),
    '<project><groupId>demo</groupId><artifactId>shop</artifactId></project>',
  );
  for (const directory of directories) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  const pom = `<project><groupId>demo</groupId><artifactId>shop</artifactId><build>${build}</build></project>`;
  return readReactor(root, pom)[0];
}

const kotlinPlugin = (configuration = '') =>
  '<plugins><plugin><groupId>org.jetbrains.kotlin</groupId>' +
  `<artifactId>kotlin-maven-plugin</artifactId>${configuration}</plugin></plugins>`;

function manifestOf(module) {
  return moduleManifest({
    module,
    classpaths: { mainCompile: [], testCompile: [] },
    pinned: {},
  });
}

function relativeKotlinRoots(module) {
  return manifestOf(module).kotlinSourceRoots;
}

describe('Kotlin source roots of a Maven module', () => {
  it('adds src/main/kotlin when kotlin-maven-plugin builds the module', () => {
    const module = moduleWith(kotlinPlugin(), ['src/main/java', 'src/main/kotlin']);

    expect(relativeKotlinRoots(module)).toEqual(['src/main/kotlin']);
  });

  it('reads the sourceDirs of the compile execution, without the Java roots', () => {
    const sourceDirs =
      '<executions><execution><goals><goal>compile</goal></goals><configuration><sourceDirs>' +
      '<sourceDir>src/main/kt</sourceDir><sourceDir>src/main/java</sourceDir>' +
      '</sourceDirs></configuration></execution></executions>';
    const module = moduleWith(kotlinPlugin(sourceDirs), ['src/main/java', 'src/main/kt']);

    expect(relativeKotlinRoots(module)).toEqual(['src/main/kt']);
  });

  it('adds none without the Kotlin plugin, or for a directory that does not exist', () => {
    const plain = moduleWith('', ['src/main/kotlin']);
    const empty = moduleWith(kotlinPlugin(), ['src/main/java']);

    expect([relativeKotlinRoots(plain), relativeKotlinRoots(empty)]).toEqual([[], []]);
  });
});

describe('Kotlin test source roots of a Maven module', () => {
  it('adds src/test/kotlin when kotlin-maven-plugin builds the module', () => {
    const module = moduleWith(kotlinPlugin(), ['src/test/java', 'src/test/kotlin']);

    expect(manifestOf(module).kotlinTestSourceRoots).toEqual(['src/test/kotlin']);
  });

  it('reads the sourceDirs of the test-compile execution, without the Java roots', () => {
    const sourceDirs =
      '<executions><execution><goals><goal>test-compile</goal></goals><configuration><sourceDirs>' +
      '<sourceDir>src/test/kt</sourceDir><sourceDir>src/test/java</sourceDir>' +
      '</sourceDirs></configuration></execution></executions>';
    const module = moduleWith(kotlinPlugin(sourceDirs), ['src/test/java', 'src/test/kt']);

    expect(manifestOf(module).kotlinTestSourceRoots).toEqual(['src/test/kt']);
  });

  it('adds none without the Kotlin plugin, or for a directory that does not exist', () => {
    const plain = moduleWith('', ['src/test/kotlin']);
    const empty = moduleWith(kotlinPlugin(), ['src/test/java']);

    expect(
      [manifestOf(plain), manifestOf(empty)].map((manifest) => manifest.kotlinTestSourceRoots),
    ).toEqual([[], []]);
  });
});
