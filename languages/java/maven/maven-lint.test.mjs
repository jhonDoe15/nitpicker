import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { javaFiles, nitpickerCheckstyleConfig, runFormat } from './maven-lint.mjs';
import { toolDependencies } from './maven-tools.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';

const roots = [];

function dependency(groupId, artifactId, version, extra = '') {
  const id = `<groupId>${groupId}</groupId><artifactId>${artifactId}</artifactId>`;
  return `<dependency>${id}<version>${version}</version>${extra}</dependency>`;
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

const LOWER_CAMEL = '^[a-z]([a-z0-9][a-zA-Z0-9]*)?$';

function naming(name, format) {
  return `<module name="${name}">\n    <property name="format" value="${format}"/>\n  </module>`;
}

describe('nitpickerCheckstyleConfig', () => {
  it('drops every inline suppression filter from the bundled Google checks', () => {
    const bundled = [
      '<module name="Checker">',
      '  <module name="SuppressWarningsFilter"/>',
      '  <module name="SuppressWithNearbyCommentFilter">',
      '    <property name="commentFormat" value="x"/>',
      '  </module>',
      '  <module name="TreeWalker"><module name="SuppressWarningsHolder" /></module>',
      `  ${naming('MemberName', '^[a-z][a-z0-9][a-zA-Z0-9]*$')}`,
      `  ${naming('MethodName', '^[a-z][a-z0-9][a-zA-Z0-9]*$')}`,
      '</module>',
    ].join('\n');

    expect(nitpickerCheckstyleConfig(bundled)).toBe(
      [
        '<module name="Checker">',
        '  ',
        '  ',
        '  <module name="TreeWalker"></module>',
        `  ${naming('MemberName', LOWER_CAMEL)}`,
        `  ${naming('MethodName', LOWER_CAMEL)}`,
        '</module>',
      ].join('\n'),
    );
  });

  it('allows one-letter member and method names like the Gradle init script', () => {
    expect(() => nitpickerCheckstyleConfig(naming('MemberName', 'x'))).toThrow(
      'nitpicker could not find MethodName in google_checks.xml',
    );
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

describe('runFormat', () => {
  function formatArguments(javaStyle) {
    const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-format-'));
    roots.push(root);
    const java = path.join(root, 'jdk/bin/java');
    mkdirSync(path.dirname(java), { recursive: true });
    writeFileSync(java, '#!/bin/sh\ncat "${1#@}"\n');
    chmodSync(java, 0o755);
    vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
    const source = path.join(root, 'src/main/java/demo/A.java');
    mkdirSync(path.dirname(source), { recursive: true });
    writeFileSync(source, 'package demo;\n\nclass A {\n    int a;\n}\n');
    const reportDir = path.join(root, 'report');
    mkdirSync(reportDir);
    const module = { basedir: root, sourceRoots: [path.dirname(source)], testSourceRoots: [] };
    runFormat({ module, reportDir, tools: { format: ['format.jar'] }, javaStyle });
    return readFileSync(path.join(reportDir, 'format.txt'), 'utf8')
      .split('\n')
      .filter((token) => token.startsWith('"--'))
      .filter((token) => !token.startsWith('"--add-exports'));
  }

  it('runs google-java-format with --aosp for the 4-space style and without it otherwise', () => {
    expect(formatArguments('aosp')).toEqual(['"--aosp"', '"--dry-run"']);
    expect(formatArguments('google')).toEqual(['"--dry-run"']);
    expect(formatArguments(undefined)).toEqual(['"--dry-run"']);
  });
});
