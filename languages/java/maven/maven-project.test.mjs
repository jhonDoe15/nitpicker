import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { moduleClasspaths, parseDependencyList, readReactor } from './maven-project.mjs';

const roots = [];

function reactor(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-reactor-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const raw = (artifactId, parent = '') =>
  `<project>${parent === '' ? '<groupId>demo</groupId>' : `<parent><groupId>${parent}</groupId></parent>`}<artifactId>${artifactId}</artifactId></project>`;

function effective(root) {
  return `<?xml version="1.0"?>
<!-- Effective POMs -->
<projects>
  <project>
    <groupId>demo</groupId>
    <artifactId>parent</artifactId>
    <packaging>pom</packaging>
    <modules><module>core</module><module>tools/app-pom.xml</module></modules>
  </project>
  <project>
    <parent><groupId>demo</groupId></parent>
    <artifactId>core</artifactId>
    <properties>
      <nitpicker.archunit.includes>**/*Rules.class</nitpicker.archunit.includes>
      <maven.compiler.release>17</maven.compiler.release>
      <project.build.sourceEncoding>ISO-8859-1</project.build.sourceEncoding>
    </properties>
    <build>
      <sourceDirectory>${root}/core/src/main/java</sourceDirectory>
      <testSourceDirectory>${root}/core/src/test/java</testSourceDirectory>
      <outputDirectory>${root}/core/out/classes</outputDirectory>
      <testOutputDirectory>${root}/core/out/test-classes</testOutputDirectory>
      <directory>${root}/core/out</directory>
      <resources><resource><directory>${root}/core/src/main/resources</directory></resource></resources>
      <plugins>
        <plugin>
          <groupId>org.codehaus.mojo</groupId>
          <artifactId>build-helper-maven-plugin</artifactId>
          <executions>
            <execution>
              <goals><goal>add-source</goal></goals>
              <configuration><sources><source>src/generated/java</source></sources></configuration>
            </execution>
          </executions>
        </plugin>
        <plugin>
          <groupId>org.jacoco</groupId>
          <artifactId>jacoco-maven-plugin</artifactId>
          <configuration><destFile>${root}/core/out/mine.exec</destFile></configuration>
          <executions><execution><goals><goal>prepare-agent</goal></goals></execution></executions>
        </plugin>
        <plugin>
          <artifactId>maven-compiler-plugin</artifactId>
          <configuration>
            <source>17</source>
            <compilerArgs><arg>-Xlint:all</arg><arg>-Xplugin:Noop</arg></compilerArgs>
            <compilerArgument>-parameters</compilerArgument>
            <enablePreview>true</enablePreview>
          </configuration>
        </plugin>
        <plugin>
          <artifactId>maven-surefire-plugin</artifactId>
          <configuration><reportsDirectory>${root}/core/out/tests</reportsDirectory></configuration>
        </plugin>
      </plugins>
    </build>
  </project>
  <project>
    <groupId>demo</groupId>
    <artifactId>app</artifactId>
    <packaging>war</packaging>
  </project>
</projects>
`;
}

const NO_COMPILER_SETTINGS = {
  release: undefined,
  source: undefined,
  target: undefined,
  encoding: undefined,
  args: [],
};

function defaultModule(basedir, { coordinates, packaging, pomFile = 'pom.xml' }) {
  const target = path.join(basedir, 'target');
  return {
    basedir,
    pomFile: path.join(basedir, pomFile),
    coordinates,
    packaging,
    buildDirectory: target,
    outputDirectory: path.join(target, 'classes'),
    testOutputDirectory: path.join(target, 'test-classes'),
    sourceRoots: [path.join(basedir, 'src/main/java')],
    testSourceRoots: [path.join(basedir, 'src/test/java')],
    resourceRoots: [],
    surefireReports: path.join(target, 'surefire-reports'),
    jacocoDestFile: undefined,
    archunitIncludes: undefined,
    compiler: NO_COMPILER_SETTINGS,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('readReactor', () => {
  it('maps each module of the effective POM to its directory, following module paths and pom files', () => {
    const root = reactor({
      'pom.xml': raw('parent'),
      'core/pom.xml': raw('core', 'demo'),
      'tools/app-pom.xml': raw('app'),
    });
    const [parent, core, app] = readReactor(root, effective(root));

    expect(parent).toEqual(defaultModule(root, { coordinates: 'demo:parent', packaging: 'pom' }));
    expect(core).toEqual({
      basedir: path.join(root, 'core'),
      pomFile: path.join(root, 'core/pom.xml'),
      coordinates: 'demo:core',
      packaging: 'jar',
      buildDirectory: `${root}/core/out`,
      outputDirectory: `${root}/core/out/classes`,
      testOutputDirectory: `${root}/core/out/test-classes`,
      sourceRoots: [`${root}/core/src/main/java`, path.join(root, 'core/src/generated/java')],
      testSourceRoots: [`${root}/core/src/test/java`],
      resourceRoots: [`${root}/core/src/main/resources`],
      surefireReports: `${root}/core/out/tests`,
      jacocoDestFile: `${root}/core/out/mine.exec`,
      archunitIncludes: '**/*Rules.class',
      compiler: {
        release: '17',
        source: '17',
        target: undefined,
        encoding: 'ISO-8859-1',
        args: ['-Xlint:all', '-Xplugin:Noop', '-parameters', '--enable-preview'],
      },
    });
    expect(app).toEqual(
      defaultModule(path.join(root, 'tools'), {
        coordinates: 'demo:app',
        packaging: 'war',
        pomFile: 'app-pom.xml',
      }),
    );
  });

  it('reads a single-module effective POM', () => {
    const root = reactor({ 'pom.xml': raw('solo') });
    const modules = readReactor(
      root,
      '<project><groupId>demo</groupId><artifactId>solo</artifactId></project>',
    );

    expect(modules.map((module) => [module.basedir, module.coordinates])).toEqual([
      [root, 'demo:solo'],
    ]);
  });
  it('matches a module whose raw coordinates use a property by its build directory', () => {
    const root = reactor({
      'pom.xml': raw('parent'),
      'a/pom.xml':
        '<project><parent><groupId>demo</groupId></parent><artifactId>${project.parent.artifactId}-a</artifactId></project>',
    });
    const effectivePom = [
      '<projects>',
      `<project><groupId>demo</groupId><artifactId>parent-a</artifactId><build><directory>${root}/a/target</directory></build></project>`,
      `<project><groupId>demo</groupId><artifactId>parent</artifactId><packaging>pom</packaging><modules><module>a</module></modules><build><directory>${root}/target</directory></build></project>`,
      '</projects>',
    ].join('');

    expect(
      readReactor(root, effectivePom).map((module) => [module.basedir, module.coordinates]),
    ).toEqual([
      [root, 'demo:parent'],
      [path.join(root, 'a'), 'demo:parent-a'],
    ]);
  });

  it.each([
    [
      'a module missing from the effective POM',
      { 'pom.xml': raw('parent'), 'gone/pom.xml': raw('gone') },
      '<modules><module>gone</module></modules>',
      (root) =>
        `Maven module ${path.join(root, 'gone/pom.xml')} is not in the effective POM; nitpicker cannot read it`,
    ],
    [
      'a module outside the project',
      { 'pom.xml': raw('parent') },
      '<modules><module>../elsewhere</module></modules>',
      (root) =>
        `Maven module ${path.resolve(root, '../elsewhere')} lies outside ${root}; run nitpicker from a directory that holds every module`,
    ],
    [
      'two modules in one directory',
      { 'pom.xml': raw('parent'), 'b/pom.xml': raw('b'), 'b/pom-alt.xml': raw('b-alt') },
      '<modules><module>b/pom-alt.xml</module><module>b</module></modules>',
      (root) =>
        `${path.join(root, 'b')} holds more than one Maven module; nitpicker reads one module per directory`,
    ],
  ])('fails on %s', (_, files, modules, message) => {
    const root = reactor(files);
    const effectivePom = [
      '<projects>',
      `<project><groupId>demo</groupId><artifactId>parent</artifactId>${modules}</project>`,
      '<project><groupId>demo</groupId><artifactId>b-alt</artifactId></project>',
      '<project><groupId>demo</groupId><artifactId>b</artifactId></project>',
      '</projects>',
    ].join('');

    expect(() => readReactor(root, effectivePom)).toThrow(new Error(message(root)));
  });
});

describe('parseDependencyList', () => {
  it('reads coordinates, scope and file, with classifiers, module names, optional markers and drive letters', () => {
    const listing = [
      '',
      'The following files have been resolved:',
      '   org.junit.jupiter:junit-jupiter-api:jar:5.11.0:test:/m2/junit-jupiter-api-5.11.0.jar -- module org.junit.jupiter.api',
      '   demo:core:jar:tests:1.0:test:/work/core/target/test-classes',
      '   demo:shared:jar:1.0:compile:C:\\work\\shared\\target\\classes (optional)',
      '   demo:z:jar:runtime:1.0:compile:/m2/z-1.0-runtime.jar',
      '   none',
    ].join('\n');

    expect(parseDependencyList(listing)).toEqual([
      {
        groupId: 'org.junit.jupiter',
        artifactId: 'junit-jupiter-api',
        type: 'jar',
        scope: 'test',
        file: '/m2/junit-jupiter-api-5.11.0.jar',
      },
      {
        groupId: 'demo',
        artifactId: 'core',
        type: 'jar',
        scope: 'test',
        file: '/work/core/target/test-classes',
      },
      {
        groupId: 'demo',
        artifactId: 'shared',
        type: 'jar',
        scope: 'compile',
        file: 'C:\\work\\shared\\target\\classes',
      },
      {
        groupId: 'demo',
        artifactId: 'z',
        type: 'jar',
        scope: 'compile',
        file: '/m2/z-1.0-runtime.jar',
      },
    ]);
  });
});

describe('moduleClasspaths', () => {
  it('keeps compile scopes for main code, adds test for test code, and everything at test runtime', () => {
    const module = { outputDirectory: '/m/classes', testOutputDirectory: '/m/test-classes' };
    const dependencies = ['compile', 'provided', 'runtime', 'test', 'system'].map((scope) => ({
      scope,
      file: `${scope}.jar`,
    }));

    expect(moduleClasspaths(module, dependencies)).toEqual({
      mainCompile: ['compile.jar', 'provided.jar', 'system.jar'],
      testCompile: ['compile.jar', 'provided.jar', 'test.jar', 'system.jar'],
      testRuntime: [
        '/m/test-classes',
        '/m/classes',
        'compile.jar',
        'provided.jar',
        'runtime.jar',
        'test.jar',
        'system.jar',
      ],
    });
  });
});
