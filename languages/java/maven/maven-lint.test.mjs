import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';
import { javaFiles, nitpickerCheckstyleConfig, writeCheckstyleSetup } from './maven-lint.mjs';
import { toolDependencies } from './maven-tools.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';

const roots = [];

function dependency(groupId, artifactId, version, extra = '') {
  const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`;
  return `<dependency>${id}<version>${version}</version>${extra}</dependency>`;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter from the bundled Google checks', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  ',
        '  <module name="TreeWalker"></module>',
        '</module>',
      ].join('\n'),
    );
  });
});

describe('writeCheckstyleSetup', () => {
  const checker = (max, check) =>
    `<module name="Checker"><module name="LineLength"><property name="max" value="${max}"/></module>` +
    `<module name="TreeWalker"><module name="${check}"/></module></module>`;
  const nitpickerConfig = checker(100, 'AvoidStarImport');
  const projectConfig = checker(140, 'MagicNumber');
  const suppressions = [
    'org.checkstyle.google.suppressionfilter.config',
    `${GRADLE_DIRECTORY}/checkstyle-suppressions.xml`,
  ].join('=');
  const doctype = [
    '<!DOCTYPE module PUBLIC "-//Checkstyle//DTD Checkstyle Configuration 1.3//EN"',
    '"https://checkstyle.org/dtds/configuration_1_3.dtd">',
  ].join(' ');
  const header = `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n`;
  const merged = (max) => `${header}<module name="Checker">
  <module name="LineLength">
    <property name="max" value="${max}"/>
  </module>
  <module name="TreeWalker">
    <module name="AvoidStarImport"/>
    <module name="MagicNumber"/>
  </module>
</module>
`;

  function projectSetup(options = {}) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);
    const project = path.join(root, 'config', 'checkstyle.xml');
    mkdirSync(path.dirname(project), { recursive: true });
    writeFileSync(project, projectConfig);
    const setup = writeCheckstyleSetup({
      directory: path.join(root, 'out'),
      nitpickerConfig,
      project,
      ...options,
    });
    return { project, setup };
  }

  it('writes only the nitpicker checks when the project has no config', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-checkstyle-setup-'));
    roots.push(root);

    const setup = writeCheckstyleSetup({ directory: path.join(root, 'out'), nitpickerConfig });

    expect(readFileSync(setup.config, 'utf8')).toBe(nitpickerConfig);
    expect(readFileSync(setup.properties, 'utf8')).toBe(suppressions);
  });

  it('lays the project config over the nitpicker checks and points config_loc at it', () => {
    const { project, setup } = projectSetup({ projectWins: true });

    expect(readFileSync(setup.config, 'utf8')).toBe(merged(140));
    expect(readFileSync(setup.properties, 'utf8')).toBe(
      `config_loc=${path.dirname(project)}\n${suppressions}`,
    );
  });

  it('keeps the values nitpicker sets when nitpicker is listed first', () => {
    const { setup } = projectSetup({ projectWins: false });

    expect(readFileSync(setup.config, 'utf8')).toBe(merged(100));
  });
});

describe('javaFiles', () => {
  it('lists the Java files under existing roots, sorted', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-files-'));
    roots.push(root);
    for (const file of ['b/B.java', 'a/A.java', 'a/notes.txt', 'a/deep/C.java']) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), '');
    }

    expect(
      javaFiles([path.join(root, 'b'), path.join(root, 'a'), path.join(root, 'missing')]),
    ).toEqual(['a/A.java', 'a/deep/C.java', 'b/B.java'].map((file) => path.join(root, file)));
  });
});

describe('maven tools', () => {
  it('keeps the project JUnit Platform for PIT and adds a launcher per missing version', () => {
    const pinned = readPinnedTools();
    const exclusions = [
      'org.junit.platform',
      'org.junit.jupiter',
      'org.opentest4j',
      'org.apiguardian',
    ]
      .map(
        (group) => `<exclusion><groupId>${group}</groupId><artifactId>*</artifactId></exclusion>`,
      )
      .join('');

    const tools = toolDependencies(pinned, ['1.11.4']);

    expect(tools.pit).toEqual([
      dependency('org.pitest', 'pitest-command-line', pinned.pitest),
      dependency(
        'org.pitest',
        'pitest-junit5-plugin',
        pinned.pitestJunit5,
        `<exclusions>${exclusions}</exclusions>`,
      ),
    ]);
    expect(tools['launcher-1.11.4']).toEqual([
      dependency('org.junit.platform', 'junit-platform-launcher', '1.11.4'),
    ]);
    expect(tools.jacoco).toEqual([
      dependency('org.jacoco', 'org.jacoco.cli', pinned.jacoco, '<classifier>nodeps</classifier>'),
    ]);
  });
});
