import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readReactor } from '../maven-project.mjs';

const roots = [];

function project(directories) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-roots-'));
  roots.push(root);
  for (const directory of directories) {
    mkdirSync(path.join(root, directory), { recursive: true });
  }
  writeFileSync(
    path.join(root, 'pom.xml'),
    '<project><groupId>demo</groupId><artifactId>app</artifactId></project>',
  );
  return root;
}

function plugin(executions, configuration = '') {
  return `<plugin><groupId>org.jetbrains.kotlin</groupId><artifactId>kotlin-maven-plugin</artifactId>
    ${configuration}<executions>${executions}</executions></plugin>`;
}

function execution(goal, directories) {
  const dirs = directories.map((directory) => `<sourceDir>${directory}</sourceDir>`).join('');
  return `<execution><id>${goal}</id><goals><goal>${goal}</goal></goals>
    <configuration><sourceDirs>${dirs}</sourceDirs></configuration></execution>`;
}

function effective(root, { build = '', plugins = '' }) {
  return `<project>
    <groupId>demo</groupId><artifactId>app</artifactId>
    <build>
      <directory>${root}/target</directory>
      <sourceDirectory>${root}/src/main/java</sourceDirectory>
      <testSourceDirectory>${root}/src/test/java</testSourceDirectory>${build}
      <plugins>${plugins}</plugins>
    </build>
  </project>`;
}

function kotlinOf(root, pom) {
  return readReactor(root, pom)[0].kotlin;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('Kotlin source roots of a Maven module', () => {
  it('is absent when the module does not apply kotlin-maven-plugin', () => {
    const root = project(['src/main/java', 'src/main/kotlin']);

    expect(kotlinOf(root, effective(root, {}))).toBeUndefined();
  });

  it('reads the sourceDirs of the compile and test-compile executions beside the module roots', () => {
    const root = project(['src/main/java', 'src/main/kotlin', 'src/test/kotlin', 'extra']);
    const plugins = plugin(
      execution('compile', [`${root}/extra`, `${root}/src/main/kotlin`]) +
        execution('test-compile', [`${root}/src/test/kotlin`]),
    );

    expect(kotlinOf(root, effective(root, { plugins }))).toEqual({
      sourceRoots: ['extra', 'src/main/java', 'src/main/kotlin'].map((name) =>
        path.join(root, name),
      ),
      testSourceRoots: ['src/test/kotlin'].map((name) => path.join(root, name)),
    });
  });

  it('falls back to the plugin-level sourceDirs and to src/main/kotlin', () => {
    const root = project(['src/main/kotlin', 'src/test/kotlin', 'app']);
    const plugins = plugin(
      '',
      `<configuration><sourceDirs><sourceDir>${root}/app</sourceDir></sourceDirs></configuration>`,
    );

    expect(kotlinOf(root, effective(root, { plugins }))).toEqual({
      sourceRoots: ['app', 'src/main/kotlin'].map((name) => path.join(root, name)),
      testSourceRoots: [path.join(root, 'src/test/kotlin')],
    });
  });

  it('leaves out roots that are missing, outside the module or generated under the build directory', () => {
    const root = project(['src/main/kotlin', 'target/generated-sources/ksp', 'elsewhere']);
    const outside = mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-outside-'));
    roots.push(outside);
    const plugins = plugin(
      execution('compile', [
        `${root}/target/generated-sources/ksp`,
        outside,
        `${root}/missing`,
        `${root}/src/main/kotlin`,
      ]),
    );

    expect(kotlinOf(root, effective(root, { plugins })).sourceRoots).toEqual([
      path.join(root, 'src/main/kotlin'),
    ]);
  });

  it('reads kapt sourceDirs as main roots', () => {
    const root = project(['kaptSources']);
    const plugins = plugin(execution('kapt', [`${root}/kaptSources`]));

    expect(kotlinOf(root, effective(root, { plugins })).sourceRoots).toEqual([
      path.join(root, 'kaptSources'),
    ]);
  });
});
