import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readReactor } from '../maven-project.mjs';

const roots = [];
const NONE_OPENED = { annotations: [], presets: [] };

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

function plugin(executions, { configuration = '', group = 'org.jetbrains.kotlin' } = {}) {
  return `<plugin><groupId>${group}</groupId><artifactId>kotlin-maven-plugin</artifactId>
    ${configuration}<executions>${executions}</executions></plugin>`;
}

function execution(goal, directories, phase = '') {
  const dirs = directories.map((directory) => `<sourceDir>${directory}</sourceDir>`).join('');
  const bound = phase === '' ? '' : `<phase>${phase}</phase>`;
  const configuration =
    directories.length === 0
      ? ''
      : `<configuration><sourceDirs>${dirs}</sourceDirs></configuration>`;
  return `<execution><id>${goal}</id>${bound}<goals><goal>${goal}</goal></goals>${configuration}</execution>`;
}

function effective(root, { build = '', plugins = '', main = 'src/main/java' }) {
  return `<project>
    <groupId>demo</groupId><artifactId>app</artifactId>
    <build>
      <directory>${root}/target</directory>
      <sourceDirectory>${root}/${main}</sourceDirectory>
      <testSourceDirectory>${root}/src/test/java</testSourceDirectory>${build}
      <plugins>${plugins}</plugins>
    </build>
  </project>`;
}

function kotlinOf(root, pom) {
  return readReactor(root, pom)[0].kotlin;
}

function under(root, names) {
  return names.map((name) => path.join(root, name));
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

  it('is absent for a plugin that only sits in pluginManagement', () => {
    const root = project(['src/main/kotlin']);
    const build = `<pluginManagement><plugins>${plugin(execution('compile', [`${root}/src/main/kotlin`]))}</plugins></pluginManagement>`;

    expect(kotlinOf(root, effective(root, { build }))).toBeUndefined();
  });

  it.each([
    ['has no executions', plugin('')],
    ['binds every execution to phase none', plugin(execution('compile', [], 'none'))],
    ['binds only other goals', plugin('<execution><goals><goal>help</goal></goals></execution>')],
    ['belongs to another group', plugin(execution('compile', []), { group: 'org.example' })],
  ])('is absent for a plugin that %s', (_name, plugins) => {
    const root = project(['src/main/kotlin']);

    expect(kotlinOf(root, effective(root, { plugins }))).toBeUndefined();
  });

  it('reads the sourceDirs of the compile and test-compile executions instead of the module roots', () => {
    const root = project(['src/main/java', 'src/main/kotlin', 'src/test/kotlin', 'extra']);
    const plugins = plugin(
      execution('compile', [`${root}/extra`, `${root}/src/main/kotlin`]) +
        execution('test-compile', [`${root}/src/test/kotlin`]),
    );

    expect(kotlinOf(root, effective(root, { plugins }))).toEqual({
      sourceRoots: under(root, ['extra', 'src/main/kotlin']),
      testSourceRoots: under(root, ['src/test/kotlin']),
      allOpen: NONE_OPENED,
    });
  });

  it('falls back to the plugin-level sourceDirs for the main roots and the module roots for the tests', () => {
    const root = project(['src/main/kotlin', 'src/test/kotlin', 'src/test/java', 'app']);
    const plugins = plugin(execution('compile', []) + execution('test-compile', []), {
      configuration: `<configuration><sourceDirs><sourceDir>${root}/app</sourceDir></sourceDirs></configuration>`,
    });

    expect(kotlinOf(root, effective(root, { plugins }))).toEqual({
      sourceRoots: under(root, ['app']),
      testSourceRoots: under(root, ['src/test/java']),
      allOpen: NONE_OPENED,
    });
  });

  it('follows the Maven source roots when no sourceDirs are configured and ignores a folder the build does not compile', () => {
    const root = project(['src/main/kotlin', 'src/main/java', 'src/test/kotlin', 'src/test/java']);
    const plugins = plugin(execution('compile', []) + execution('test-compile', []));

    expect(kotlinOf(root, effective(root, { plugins }))).toEqual({
      sourceRoots: under(root, ['src/main/java']),
      testSourceRoots: under(root, ['src/test/java']),
      allOpen: NONE_OPENED,
    });
  });

  it('follows the sourceDirectory of the build when no sourceDirs are configured', () => {
    const root = project(['src/main/kotlin', 'src/main/java']);
    const plugins = plugin(execution('compile', []));

    expect(
      kotlinOf(root, effective(root, { plugins, main: 'src/main/kotlin' })).sourceRoots,
    ).toEqual(under(root, ['src/main/kotlin']));
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

    expect(kotlinOf(root, effective(root, { plugins })).sourceRoots).toEqual(
      under(root, ['src/main/kotlin']),
    );
  });

  it('keeps only the outermost of nested roots', () => {
    const root = project(['src/main/kotlin/gen', 'src/main/kotlin']);
    const plugins = plugin(
      execution('compile', [`${root}/src/main/kotlin/gen`, `${root}/src/main/kotlin`]),
    );

    expect(kotlinOf(root, effective(root, { plugins })).sourceRoots).toEqual(
      under(root, ['src/main/kotlin']),
    );
  });

  it('reads kapt sourceDirs as main roots', () => {
    const root = project(['kaptSources']);
    const plugins = plugin(execution('kapt', [`${root}/kaptSources`]));

    expect(kotlinOf(root, effective(root, { plugins })).sourceRoots).toEqual(
      under(root, ['kaptSources']),
    );
  });
});

describe('The all-open options of a Kotlin Maven module', () => {
  const opened = (root, executions, configuration) =>
    kotlinOf(root, effective(root, { plugins: plugin(executions, { configuration }) })).allOpen;
  const compile = (inside) =>
    `<execution><id>compile</id><goals><goal>compile</goal></goals><configuration>${inside}</configuration></execution>`;

  it('reads the annotations and the preset of the all-open plugin from the compile execution', () => {
    const root = project(['src/main/kotlin']);
    const inside =
      '<compilerPlugins><plugin>all-open</plugin></compilerPlugins><pluginOptions>' +
      '<option>all-open:annotation=demo.Open</option><option>all-open:annotation=demo.Wide</option>' +
      '<option>all-open:preset=spring</option><option>no-arg:annotation=demo.Ignored</option></pluginOptions>';

    expect(opened(root, compile(inside))).toEqual({
      annotations: ['demo.Open', 'demo.Wide'],
      presets: ['spring'],
    });
  });

  it('counts the spring compiler plugin as the all-open plugin with the spring preset', () => {
    const root = project(['src/main/kotlin']);
    const inside = '<compilerPlugins><plugin>spring</plugin><plugin>jpa</plugin></compilerPlugins>';

    expect(opened(root, compile(inside))).toEqual({ annotations: [], presets: ['spring'] });
  });

  it('falls back to the plugin-level configuration, and ignores the test-compile execution', () => {
    const root = project(['src/main/kotlin']);
    const level =
      '<configuration><compilerPlugins><plugin>spring</plugin></compilerPlugins></configuration>';
    const testOnly =
      '<execution><id>t</id><goals><goal>test-compile</goal></goals><configuration><pluginOptions><option>all-open:annotation=demo.T</option></pluginOptions></configuration></execution>';

    expect(opened(root, execution('compile', []), level)).toEqual({
      annotations: [],
      presets: ['spring'],
    });
    expect(opened(root, execution('compile', []) + testOnly)).toEqual(NONE_OPENED);
  });
});
