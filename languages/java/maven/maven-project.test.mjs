import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  lifecycleArgs,
  moduleClasspaths,
  parseDependencyList,
  readReactor,
} from './maven-project.mjs';

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
    <properties><nitpicker.archunit.includes>**/*Rules.class</nitpicker.archunit.includes></properties>
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
          <artifactId>maven-surefire-plugin</artifactId>
          <configuration><reportsDirectory>${root}/core/out/tests</reportsDirectory></configuration>
        </plugin>
        <plugin>
          <artifactId>maven-failsafe-plugin</artifactId>
          <configuration><reportsDirectory>${root}/core/out/it-tests</reportsDirectory></configuration>
          <executions>
            <execution><goals><goal>integration-test</goal><goal>verify</goal></goals></execution>
          </executions>
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

const PLUGIN_DEFAULT_LEVEL = { release: undefined, source: '8', target: '8' };
const NO_COMPILER_SETTINGS = {
  ...PLUGIN_DEFAULT_LEVEL,
  encoding: undefined,
  compilerArgs: [],
  proc: undefined,
  processorPaths: undefined,
  test: { ...PLUGIN_DEFAULT_LEVEL, compilerArgs: [] },
};

function defaultModule(basedir, coordinates, packaging) {
  const target = path.join(basedir, 'target');
  return {
    basedir,
    coordinates,
    packaging,
    buildDirectory: target,
    outputDirectory: path.join(target, 'classes'),
    testOutputDirectory: path.join(target, 'test-classes'),
    sourceRoots: [path.join(basedir, 'src/main/java')],
    testSourceRoots: [path.join(basedir, 'src/test/java')],
    resourceRoots: [],
    surefireReports: path.join(target, 'surefire-reports'),
    failsafeReports: path.join(target, 'failsafe-reports'),
    runsFailsafe: false,
    published: false,
    jacocoDestFiles: [],
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

    expect(parent).toEqual(defaultModule(root, 'demo:parent', 'pom'));
    expect(core).toEqual({
      basedir: path.join(root, 'core'),
      coordinates: 'demo:core',
      packaging: 'jar',
      buildDirectory: `${root}/core/out`,
      outputDirectory: `${root}/core/out/classes`,
      testOutputDirectory: `${root}/core/out/test-classes`,
      sourceRoots: [`${root}/core/src/main/java`, path.join(root, 'core/src/generated/java')],
      testSourceRoots: [`${root}/core/src/test/java`],
      resourceRoots: [`${root}/core/src/main/resources`],
      surefireReports: `${root}/core/out/tests`,
      failsafeReports: `${root}/core/out/it-tests`,
      runsFailsafe: true,
      published: false,
      jacocoDestFiles: [`${root}/core/out/mine.exec`],
      archunitIncludes: '**/*Rules.class',
      compiler: NO_COMPILER_SETTINGS,
    });
    expect(app).toEqual(defaultModule(path.join(root, 'tools'), 'demo:app', 'war'));
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

const IT_GOAL = '<goals><goal>integration-test</goal></goals>';

function soloModule(inner) {
  const root = reactor({ 'pom.xml': raw('solo') });
  const [module] = readReactor(
    root,
    `<project><groupId>demo</groupId><artifactId>solo</artifactId>${inner}</project>`,
  );
  return module;
}

function plugin(artifactId, body, groupId = 'org.apache.maven.plugins') {
  return `<plugin><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>${body}</plugin>`;
}

function failsafe(executions, configuration = '') {
  return plugin(
    'maven-failsafe-plugin',
    `<configuration>${configuration}</configuration><executions>${executions}</executions>`,
  );
}

const inBuild = (plugins) => `<build><plugins>${plugins}</plugins></build>`;

describe('lifecycleArgs', () => {
  it('runs verify, with release, publishing and network plugins and JaCoCo checks off, when Failsafe runs', () => {
    const module = soloModule(inBuild(failsafe(`<execution>${IT_GOAL}</execution>`)));

    expect(module.runsFailsafe).toBe(true);
    expect(lifecycleArgs([{ runsFailsafe: false }, module])).toEqual([
      'verify',
      '-Djacoco.haltOnFailure=false',
      '-Dgpg.skip=true',
      '-Dmaven.javadoc.skip=true',
      '-Dmaven.source.skip=true',
      '-Dmaven.deploy.skip=true',
      '-Djib.skip=true',
      '-Ddependency-check.skip=true',
      '-Drat.skip=true',
      '-Dlicense.skip=true',
      '-Dlicense.skipDownloadLicenses=true',
      '-Dlicense.skipAggregateDownloadLicenses=true',
      '-Djapicmp.skip=true',
    ]);
  });

  it('lets an execution turn Failsafe back on that its plugin configuration skips', () => {
    const execution = `<execution>${IT_GOAL}<configuration><skipITs>false</skipITs></configuration></execution>`;

    expect(soloModule(inBuild(failsafe(execution, '<skipITs>true</skipITs>'))).runsFailsafe).toBe(
      true,
    );
  });

  it.each([
    ['no Failsafe plugin', ''],
    ['Failsafe without executions', inBuild(failsafe(''))],
    [
      'only the verify goal',
      inBuild(failsafe('<execution><goals><goal>verify</goal></goals></execution>')),
    ],
    [
      'the skipITs property',
      `<properties><skipITs>true</skipITs></properties>${inBuild(failsafe(`<execution>${IT_GOAL}</execution>`))}`,
    ],
    [
      'the skipTests property',
      `<properties><skipTests>TRUE</skipTests></properties>${inBuild(failsafe(`<execution>${IT_GOAL}</execution>`))}`,
    ],
    [
      'skip in the execution',
      inBuild(
        failsafe(
          `<execution>${IT_GOAL}<configuration><skip>true</skip></configuration></execution>`,
        ),
      ),
    ],
    [
      'skipTests in the execution',
      inBuild(
        failsafe(
          `<execution>${IT_GOAL}<configuration><skipTests>true</skipTests></configuration></execution>`,
        ),
      ),
    ],
    [
      'skip in the plugin',
      inBuild(failsafe(`<execution>${IT_GOAL}</execution>`, '<skip>true</skip>')),
    ],
    [
      'skipITs in the plugin',
      inBuild(failsafe(`<execution>${IT_GOAL}</execution>`, '<skipITs>true</skipITs>')),
    ],
    ['the phase none', inBuild(failsafe(`<execution><phase>none</phase>${IT_GOAL}</execution>`))],
    [
      'Failsafe only under pluginManagement',
      `<build><pluginManagement><plugins>${failsafe(`<execution>${IT_GOAL}</execution>`)}` +
        '</plugins></pluginManagement></build>',
    ],
    [
      'Failsafe only in an inactive profile',
      `<profiles><profile><id>it</id>${inBuild(failsafe(`<execution>${IT_GOAL}</execution>`))}</profile></profiles>`,
    ],
  ])('stays on test with %s', (_, inner) => {
    const module = soloModule(inner);

    expect([module.runsFailsafe, lifecycleArgs([module])]).toEqual([false, ['test']]);
  });
});

describe('describeModule plugin configuration', () => {
  it('reads report directories from the test execution before the plugin configuration', () => {
    const surefire = plugin(
      'maven-surefire-plugin',
      '<configuration><reportsDirectory>plugin-unit</reportsDirectory></configuration>' +
        '<executions><execution><goals><goal>test</goal></goals>' +
        '<configuration><reportsDirectory>execution-unit</reportsDirectory></configuration></execution></executions>',
    );
    const execution =
      `<execution>${IT_GOAL}<configuration>` +
      '<reportsDirectory>execution-it</reportsDirectory></configuration></execution>';
    const module = soloModule(
      inBuild(surefire + failsafe(execution, '<reportsDirectory>plugin-it</reportsDirectory>')),
    );

    expect([module.surefireReports, module.failsafeReports]).toEqual([
      path.join(module.basedir, 'execution-unit'),
      path.join(module.basedir, 'execution-it'),
    ]);
  });

  it('reads the destFile of every JaCoCo agent execution, the execution before the plugin', () => {
    const jacoco = plugin(
      'jacoco-maven-plugin',
      '<configuration><destFile>target/unit.exec</destFile></configuration><executions>' +
        '<execution><goals><goal>prepare-agent</goal></goals></execution>' +
        '<execution><goals><goal>prepare-agent-integration</goal></goals>' +
        '<configuration><destFile>target/it.exec</destFile></configuration></execution>' +
        '<execution><id>again</id><goals><goal>prepare-agent</goal></goals></execution>' +
        '</executions>',
      'org.jacoco',
    );
    const module = soloModule(inBuild(jacoco));

    expect(module.jacocoDestFiles).toEqual([
      path.join(module.basedir, 'target/unit.exec'),
      path.join(module.basedir, 'target/it.exec'),
    ]);
  });
});

describe('describeModule publishing', () => {
  const DISTRIBUTION =
    '<distributionManagement><repository><id>releases</id><url>https://repo.example.com</url>' +
    '</repository></distributionManagement>';

  it('counts a module with distributionManagement as published unless deploy is skipped', () => {
    const skippedByProperty = `${DISTRIBUTION}<properties><maven.deploy.skip>true</maven.deploy.skip></properties>`;
    const skippedByPlugin =
      DISTRIBUTION +
      inBuild(plugin('maven-deploy-plugin', '<configuration><skip>true</skip></configuration>'));

    expect(
      [DISTRIBUTION, skippedByProperty, skippedByPlugin, ''].map(
        (inner) => soloModule(inner).published,
      ),
    ).toEqual([true, false, false, false]);
  });
});

describe('parseDependencyList', () => {
  it('reads scope and file, with classifiers, module names, optional markers and drive letters', () => {
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
      { scope: 'test', file: '/m2/junit-jupiter-api-5.11.0.jar' },
      { scope: 'test', file: '/work/core/target/test-classes' },
      { scope: 'compile', file: 'C:\\work\\shared\\target\\classes' },
      { scope: 'compile', file: '/m2/z-1.0-runtime.jar' },
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
