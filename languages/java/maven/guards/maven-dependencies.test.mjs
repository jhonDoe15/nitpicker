import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zipOf } from '../../builds/test-support/zip-writer.mjs';
import { declaredDependencies, dependencyReport } from './maven-dependencies.mjs';

const roots = [];

function dependency(groupId, artifactId, scope) {
  const scoped = scope === undefined ? '' : `<scope>${scope}</scope>`;
  return `<dependency><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId><version>1</version>${scoped}</dependency>`;
}

const POM = `<project>
  <artifactId>app</artifactId>
  <dependencyManagement><dependencies>${dependency('managed', 'only')}</dependencies></dependencyManagement>
  <dependencies>
    ${dependency('org.apache.commons', 'commons-lang3')}
    ${dependency('org.apache.commons', 'commons-text', 'compile')}
    ${dependency('org.springframework', 'spring-web', 'provided')}
    ${dependency('org.slf4j', 'slf4j-simple', 'runtime')}
    ${dependency('org.junit.jupiter', 'junit-jupiter', 'test')}
    ${dependency('${project.groupId}', 'core')}
  </dependencies>
</project>`;

function module(root) {
  const outputDirectory = path.join(root, 'target/classes');
  mkdirSync(path.join(outputDirectory, 'demo'), { recursive: true });
  writeFileSync(
    path.join(outputDirectory, 'demo/App.class'),
    Buffer.from('Êþ\u0001(Lorg/apache/commons/lang3/StringUtils;)V\u0000', 'latin1'),
  );
  writeFileSync(path.join(root, 'pom.xml'), POM);
  return { basedir: root, pomFile: path.join(root, 'pom.xml'), outputDirectory };
}

function jar(root, name, entries) {
  const file = path.join(root, name);
  writeFileSync(file, zipOf(Object.fromEntries(entries.map((entry) => [entry, '']))));
  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('declaredDependencies', () => {
  it('keeps the dependencies the POM itself declares with compile scope', () => {
    expect(declaredDependencies(POM).map(({ group, name }) => `${group}:${name}`)).toEqual([
      'org.apache.commons:commons-lang3',
      'org.apache.commons:commons-text',
      '${project.groupId}:core',
    ]);
  });
});

describe('dependencyReport', () => {
  it('marks each declared library used when a main class references a class in its own jar', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dependencies-'));
    roots.push(root);
    const lang = jar(root, 'commons-lang3-3.17.0.jar', ['org/apache/commons/lang3/StringUtils.class']);
    const text = jar(root, 'commons-text-1.13.0.jar', ['org/apache/commons/text/WordUtils.class']);
    const resolved = [
      { groupId: 'org.apache.commons', artifactId: 'commons-lang3', scope: 'compile', file: lang },
      { groupId: 'org.apache.commons', artifactId: 'commons-text', scope: 'compile', file: text },
      { groupId: 'demo', artifactId: 'core', scope: 'compile', file: path.join(root, 'core') },
    ];

    expect(dependencyReport({ module: module(root), resolved, reactor: ['demo:core', 'demo:app'] })).toEqual({
      build: 'maven',
      buildFile: 'pom.xml',
      analyzed: true,
      declared: [
        {
          configuration: 'compile',
          group: 'org.apache.commons',
          name: 'commons-lang3',
          archives: ['commons-lang3-3.17.0.jar'],
          used: true,
        },
        {
          configuration: 'compile',
          group: 'org.apache.commons',
          name: 'commons-text',
          archives: ['commons-text-1.13.0.jar'],
          used: false,
        },
      ],
    });
  });

  it('analyzes nothing in a module without main classes', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dependencies-'));
    roots.push(root);
    writeFileSync(path.join(root, 'pom.xml'), POM);

    const report = dependencyReport({
      module: { basedir: root, pomFile: path.join(root, 'pom.xml'), outputDirectory: path.join(root, 'none') },
      resolved: [],
      reactor: [],
    });

    expect(report.analyzed).toBe(false);
    expect(report.declared.every((entry) => entry.archives.length === 0)).toBe(true);
  });
});
