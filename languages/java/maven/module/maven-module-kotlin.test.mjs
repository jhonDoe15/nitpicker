import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleManifest } from './maven-module.mjs';
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

const kotlinPlugin = (sourceDirs = []) =>
  '<plugins><plugin><groupId>org.jetbrains.kotlin</groupId>' +
  '<artifactId>kotlin-maven-plugin</artifactId><executions><execution>' +
  '<goals><goal>compile</goal></goals>' +
  (sourceDirs.length === 0
    ? ''
    : `<configuration><sourceDirs>${sourceDirs
        .map((directory) => `<sourceDir>${directory}</sourceDir>`)
        .join('')}</sourceDirs></configuration>`) +
  '</execution></executions></plugin></plugins>';

function relativeKotlinRoots(module) {
  return moduleManifest({
    module,
    classpaths: { mainCompile: [], testCompile: [] },
    pinned: {},
  }).kotlinSourceRoots;
}

describe('Kotlin source roots of a Maven module', () => {
  it('compiles the Maven source roots when the plugin configures no sourceDirs', () => {
    const module = moduleWith(kotlinPlugin(), ['src/main/java', 'src/main/kotlin']);

    expect([module.kotlin.sourceRoots, relativeKotlinRoots(module)]).toEqual([
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
