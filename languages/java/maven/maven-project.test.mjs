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
    jacocoDestFile: undefined,
    archunitIncludes: undefined,
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
      jacocoDestFile: `${root}/core/out/mine.exec`,
      archunitIncludes: '**/*Rules.class',
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
});

describe('parseDependencyList', () => {
  it('reads scope and file, with classifiers, module names, optional markers and drive letters', () => {
    const listing = [
      '',
      'The following files have been resolved:',
      '   org.junit.jupiter:junit-jupiter-api:jar:5.11.0:test:/m2/junit-jupiter-api-5.11.0.jar -- module org.junit.jupiter.api',
      '   demo:core:jar:tests:1.0:test:/work/core/target/test-classes',
      '   demo:shared:jar:1.0:compile:C:\\work\\shared\\target\\classes (optional)',
      '   none',
    ].join('\n');

    expect(parseDependencyList(listing)).toEqual([
      { scope: 'test', file: '/m2/junit-jupiter-api-5.11.0.jar' },
      { scope: 'test', file: '/work/core/target/test-classes' },
      { scope: 'compile', file: 'C:\\work\\shared\\target\\classes' },
    ]);
  });
});

describe('moduleClasspaths', () => {
  it('keeps compile, provided and system scopes for main code and everything for tests', () => {
    const module = { outputDirectory: '/m/classes', testOutputDirectory: '/m/test-classes' };
    const dependencies = ['compile', 'provided', 'runtime', 'test', 'system'].map((scope) => ({
      scope,
      file: `${scope}.jar`,
    }));

    expect(moduleClasspaths(module, dependencies)).toEqual({
      mainCompile: ['compile.jar', 'provided.jar', 'system.jar'],
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
