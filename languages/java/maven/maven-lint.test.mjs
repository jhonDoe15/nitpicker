import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { javaFiles, nitpickerCheckstyleConfig, scopedRuleset } from './maven-lint.mjs';
import { GRADLE_DIRECTORY } from '../builds/java-build.mjs';
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

describe('scopedRuleset', () => {
  const testRoot = path.join('/repo', 'src', 'test', 'java');
  const pattern = `${testRoot}${path.sep}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reference = (ruleset) => `  <rule ref="${path.join(GRADLE_DIRECTORY, ruleset)}"/>`;

  it('keeps the main-source rules out of the test roots', () => {
    const xml = scopedRuleset({
      name: 'code-smells-main',
      ruleset: 'code-smells-ruleset.xml',
      roots: [testRoot],
      onlyThere: false,
    });

    expect(xml.split('\n').filter((line) => line.startsWith('  <'))).toEqual([
      '  <description>code-smells-main</description>',
      `  <exclude-pattern>${pattern}.*</exclude-pattern>`,
      reference('code-smells-ruleset.xml'),
    ]);
  });

  it('runs the test-source rules only inside the test roots', () => {
    const xml = scopedRuleset({
      name: 'code-smells-test',
      ruleset: 'code-smells-test-ruleset.xml',
      roots: [testRoot],
      onlyThere: true,
    });

    expect(xml.split('\n').filter((line) => line.startsWith('  <'))).toEqual([
      '  <description>code-smells-test</description>',
      '  <exclude-pattern>.*</exclude-pattern>',
      `  <include-pattern>${pattern}.*</include-pattern>`,
      reference('code-smells-test-ruleset.xml'),
    ]);
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
