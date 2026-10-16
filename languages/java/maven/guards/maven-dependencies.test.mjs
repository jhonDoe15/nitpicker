import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { zipOf } from '../../builds/test-support/zip-writer.mjs';
import { declaredDependencies, dependencyReport } from './maven-dependencies.mjs';

const roots = [];

function dependency(groupId, artifactId, scope) {
  const scoped = scope === undefined ? '' : `<scope>${scope}</scope>`;
  return [
    `<dependency><groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`,
    `<version>1</version>${scoped}</dependency>`,
  ].join('');
}

function pomOf(...dependencies) {
  return `<project><artifactId>app</artifactId><dependencies>${dependencies.join('')}</dependencies></project>`;
}

const LANG_REFERENCE = 'Êþ\u0001(Lorg/apache/commons/lang3/StringUtils;)V\u0000';

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
    ${dependency('org.mapstruct', 'mapstruct-processor')}
    <dependency><groupId>com.h2database</groupId><artifactId>h2</artifactId><optional>true</optional></dependency>
  </dependencies>
</project>`;

function module(root, { pom = POM, content = LANG_REFERENCE } = {}) {
  const outputDirectory = path.join(root, 'target/classes');
  mkdirSync(path.join(outputDirectory, 'demo'), { recursive: true });
  writeFileSync(path.join(outputDirectory, 'demo/App.class'), Buffer.from(content, 'latin1'));
  writeFileSync(path.join(root, 'pom.xml'), pom);
  return { basedir: root, pomFile: path.join(root, 'pom.xml'), outputDirectory };
}

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-dependencies-'));
  roots.push(root);
  return root;
}

function entryOf(name, { group, archives, used }) {
  return { configuration: 'compile', group, name, archives, used };
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
  it('keeps the dependencies the POM itself declares with compile scope and not optional', () => {
    expect(declaredDependencies(POM).map(({ group, name }) => `${group}:${name}`)).toEqual([
      'org.apache.commons:commons-lang3',
      'org.apache.commons:commons-text',
      '${project.groupId}:core',
      'org.mapstruct:mapstruct-processor',
    ]);
  });
});

describe('dependencyReport', () => {
  it('marks a library used when a main class references it or it is an annotation processor', () => {
    const root = workspace();
    const lang = jar(root, 'commons-lang3-3.17.0.jar', [
      'org/apache/commons/lang3/StringUtils.class',
    ]);
    const text = jar(root, 'commons-text-1.13.0.jar', ['org/apache/commons/text/WordUtils.class']);
    const processor = jar(root, 'mapstruct-processor-1.6.3.jar', [
      'org/mapstruct/ap/MappingProcessor.class',
      'META-INF/services/javax.annotation.processing.Processor',
    ]);
    const resolved = [
      {
        groupId: 'org.mapstruct',
        artifactId: 'mapstruct-processor',
        scope: 'compile',
        file: processor,
      },
      { groupId: 'org.apache.commons', artifactId: 'commons-lang3', scope: 'compile', file: lang },
      { groupId: 'org.apache.commons', artifactId: 'commons-text', scope: 'compile', file: text },
      { groupId: 'demo', artifactId: 'core', scope: 'compile', file: path.join(root, 'core') },
    ];

    expect(
      dependencyReport({ module: module(root), resolved, reactor: ['demo:core', 'demo:app'] }),
    ).toEqual({
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
        {
          configuration: 'compile',
          group: 'org.mapstruct',
          name: 'mapstruct-processor',
          archives: ['mapstruct-processor-1.6.3.jar'],
          used: true,
        },
      ],
    });
  });

  it('analyzes nothing in a module without main classes', () => {
    const root = workspace();
    writeFileSync(path.join(root, 'pom.xml'), POM);

    const report = dependencyReport({
      module: {
        basedir: root,
        pomFile: path.join(root, 'pom.xml'),
        outputDirectory: path.join(root, 'none'),
      },
      resolved: [],
      reactor: [],
    });

    expect(report).toEqual({
      build: 'maven',
      buildFile: 'pom.xml',
      analyzed: false,
      declared: [
        entryOf('commons-lang3', { group: 'org.apache.commons', archives: [], used: false }),
        entryOf('commons-text', { group: 'org.apache.commons', archives: [], used: false }),
        entryOf('core', { group: '${project.groupId}', archives: [], used: false }),
        entryOf('mapstruct-processor', { group: 'org.mapstruct', archives: [], used: false }),
      ],
    });
  });

  it.each([
    ['a bare class reference', '\u0001\u0000\u0022org/acme/widgets/Widget\u0000'],
    ['a class reference in a descriptor', 'Êþ\u0001(Lorg/acme/widgets/Widget;)V\u0000'],
    [
      'a long descriptor whose length byte is a letter',
      '\u0001\u0000ELorg/acme/widgets/Widget;\u0000',
    ],
  ])('finds a library through %s', (_, content) => {
    const root = workspace();
    const widgets = jar(root, 'widgets-1.0.jar', ['org/acme/widgets/Widget.class']);
    const other = jar(root, 'other-1.0.jar', ['org/acme/other/Other.class']);
    const resolved = [
      { groupId: 'org.acme', artifactId: 'widgets', scope: 'compile', file: widgets },
      { groupId: 'org.acme', artifactId: 'other', scope: 'compile', file: other },
    ];
    const pom = pomOf(dependency('org.acme', 'widgets'), dependency('org.acme', 'other'));

    expect(
      dependencyReport({ module: module(root, { pom, content }), resolved, reactor: [] }).declared,
    ).toEqual([
      entryOf('widgets', { group: 'org.acme', archives: ['widgets-1.0.jar'], used: true }),
      entryOf('other', { group: 'org.acme', archives: ['other-1.0.jar'], used: false }),
    ]);
  });

  it('takes the group of a ${project.groupId} dependency from the resolved artifact', () => {
    const root = workspace();
    const core = jar(root, 'core-1.0.jar', ['demo/core/Core.class']);
    const resolved = [{ groupId: 'demo', artifactId: 'core', scope: 'compile', file: core }];
    const pom = pomOf(dependency('${project.groupId}', 'core'));

    expect(
      dependencyReport({ module: module(root, { pom }), resolved, reactor: [] }).declared,
    ).toEqual([entryOf('core', { group: 'demo', archives: ['core-1.0.jar'], used: false })]);
  });

  it('ignores resolved entries that are not compile scope or not an existing jar or directory', () => {
    const root = workspace();
    const lang = jar(root, 'commons-lang3-3.17.0.jar', [
      'org/apache/commons/lang3/StringUtils.class',
    ]);
    const text = jar(root, 'commons-text-1.13.0.jar', ['org/apache/commons/text/WordUtils.class']);
    writeFileSync(path.join(root, 'commons-lang3-3.17.0.pom'), '<project/>');
    writeFileSync(path.join(root, 'commons-text-1.13.0-sources.zip'), 'zip');
    const resolved = [
      { groupId: 'org.apache.commons', artifactId: 'commons-lang3', scope: 'test', file: lang },
      {
        groupId: 'org.apache.commons',
        artifactId: 'commons-lang3',
        scope: 'compile',
        file: path.join(root, 'commons-lang3-3.17.0.pom'),
      },
      {
        groupId: 'org.apache.commons',
        artifactId: 'commons-lang3',
        scope: 'compile',
        file: path.join(root, 'gone.jar'),
      },
      { groupId: 'org.apache.commons', artifactId: 'commons-text', scope: 'compile', file: text },
      {
        groupId: 'org.apache.commons',
        artifactId: 'commons-text',
        scope: 'compile',
        file: path.join(root, 'commons-text-1.13.0-sources.zip'),
      },
      { groupId: 'org.apache.commons', artifactId: 'commons-text', scope: 'provided', file: lang },
    ];
    const pom = pomOf(
      dependency('org.apache.commons', 'commons-lang3'),
      dependency('org.apache.commons', 'commons-text'),
    );

    expect(
      dependencyReport({ module: module(root, { pom }), resolved, reactor: [] }).declared,
    ).toEqual([
      entryOf('commons-lang3', { group: 'org.apache.commons', archives: [], used: false }),
      entryOf('commons-text', {
        group: 'org.apache.commons',
        archives: ['commons-text-1.13.0.jar'],
        used: false,
      }),
    ]);
  });

  it('reads a resolved directory as an archive of its class files', () => {
    const root = workspace();
    const used = path.join(root, 'used/classes');
    const unused = path.join(root, 'unused/classes');
    mkdirSync(path.join(used, 'org/apache/commons/lang3'), { recursive: true });
    mkdirSync(path.join(unused, 'org/other'), { recursive: true });
    writeFileSync(path.join(used, 'org/apache/commons/lang3/StringUtils.class'), '');
    writeFileSync(path.join(unused, 'org/other/Other.class'), '');
    const resolved = [
      { groupId: 'g', artifactId: 'used', scope: 'compile', file: used },
      { groupId: 'g', artifactId: 'unused', scope: 'compile', file: unused },
    ];
    const pom = pomOf(dependency('g', 'used'), dependency('g', 'unused'));

    expect(
      dependencyReport({ module: module(root, { pom }), resolved, reactor: [] }).declared,
    ).toEqual([
      entryOf('used', { group: 'g', archives: ['classes'], used: true }),
      entryOf('unused', { group: 'g', archives: ['classes'], used: false }),
    ]);
  });

  it('counts a declared dependency whose jar cannot be read as used', () => {
    const root = workspace();
    const broken = path.join(root, 'broken-1.0.jar');
    writeFileSync(broken, 'this is not a zip archive');
    const resolved = [{ groupId: 'g', artifactId: 'broken', scope: 'compile', file: broken }];
    const pom = pomOf(dependency('g', 'broken'));

    expect(
      dependencyReport({ module: module(root, { pom }), resolved, reactor: [] }).declared,
    ).toEqual([entryOf('broken', { group: 'g', archives: ['broken-1.0.jar'], used: true })]);
  });
});
