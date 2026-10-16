import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { zipOf } from '../../builds/test-support/zip-writer.mjs';
import { isModulePathEntry, jdepsModuleOptions } from './maven-jdeps.mjs';

const roots = [];
const CLASS = 'class bytes';
const JARS = {
  'explicit-1.0.jar': { 'module-info.class': CLASS, 'a/A.class': CLASS },
  'versioned-1.0.jar': { 'META-INF/versions/9/module-info.class': CLASS, 'b/B.class': CLASS },
  'named-1.0.jar': {
    'META-INF/MANIFEST.MF': 'Manifest-Version: 1.0\r\nAutomatic-Module-Name: org.named\r\n',
    'c/C.class': CLASS,
  },
  'commons-io-2.11.0.jar': { 'org/apache/commons/io/IOUtils.class': CLASS },
  'top-level-1.0.jar': { 'Top.class': CLASS },
  'foo-native-1.0.jar': { 'p/P.class': CLASS },
  'bad-package-1.0.jar': { 'p/1x/P.class': CLASS },
  '1st-1.0.jar': { 'p/P.class': CLASS },
  'unreadable-1.0.jar': 'not a zip',
  'groovy-all-2.4.21.pom': '<project/>',
  'bundle-1.0.zip': { 'p/P.class': CLASS },
};

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jdeps-'));
  roots.push(root);
  for (const [name, content] of Object.entries(JARS)) {
    writeFileSync(path.join(root, name), typeof content === 'string' ? content : zipOf(content));
  }
  mkdirSync(path.join(root, 'modular-classes'));
  writeFileSync(path.join(root, 'modular-classes/module-info.class'), CLASS);
  mkdirSync(path.join(root, 'plain-classes/sib'), { recursive: true });
  writeFileSync(path.join(root, 'plain-classes/sib/S.class'), CLASS);
  const output = path.join(root, 'target/classes');
  mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, 'module-info.class'), CLASS);
  return { root, output };
}

function fakeJdeps(root, version) {
  const jdeps = path.join(root, 'jdk/bin/jdeps');
  mkdirSync(path.dirname(jdeps), { recursive: true });
  writeFileSync(jdeps, ['#!/bin/sh', `echo '${version}'`].join('\n'));
  chmodSync(jdeps, 0o755);
  vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
}

function options(compiler, entries = Object.keys(JARS)) {
  const { root, output } = workspace();
  fakeJdeps(root, '17.0.2');
  return jdepsModuleOptions(
    { outputDirectory: output, compiler: { args: [], ...compiler } },
    { mainCompile: entries.map((name) => path.join(root, name)) },
  ).map((option) => option.replaceAll(root, '<root>'));
}

beforeEach(() => {
  vi.stubEnv('JAVA_TOOL_OPTIONS', undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('jdepsModuleOptions', () => {
  it('puts only the entries jdeps can read as modules on the module path', () => {
    expect(
      options({ release: '17' }, [
        ...Object.keys(JARS),
        'modular-classes',
        'plain-classes',
        'missing-1.0.jar',
      ]),
    ).toEqual([
      '--module-path',
      [
        'explicit-1.0.jar',
        'versioned-1.0.jar',
        'named-1.0.jar',
        'commons-io-2.11.0.jar',
        'modular-classes',
      ]
        .map((name) => `<root>/${name}`)
        .join(path.delimiter),
      '--multi-release',
      '17',
    ]);
  });

  it.each([
    ['release 8', { release: '8' }, '9'],
    ['target 1.8', { target: '1.8' }, '9'],
    ['a --release compiler argument', { args: ['--release', '11'] }, '11'],
    ['a --release= compiler argument', { args: ['--release=21'] }, '21'],
    ['release 17 over target 11', { release: '17', target: '11' }, '17'],
    ['no release, source or target', {}, '17'],
  ])('passes --multi-release for %s', (_, compiler, release) => {
    expect(options(compiler, [])).toEqual(['--multi-release', release]);
  });

  it('adds nothing to a module without a descriptor', () => {
    const { root } = workspace();

    expect(
      jdepsModuleOptions(
        {
          outputDirectory: path.join(root, 'plain-classes'),
          compiler: { release: '17', args: [] },
        },
        { mainCompile: [path.join(root, 'explicit-1.0.jar')] },
      ),
    ).toEqual([]);
  });
});

describe.skipIf(process.platform === 'win32')('isModulePathEntry', () => {
  it.each([
    ['explicit-1.0.jar', true],
    ['commons-io-2.11.0.jar', true],
    ['top-level-1.0.jar', false],
    ['foo-native-1.0.jar', false],
    ['bad-package-1.0.jar', false],
    ['1st-1.0.jar', false],
    ['unreadable-1.0.jar', false],
    ['groovy-all-2.4.21.pom', false],
    ['bundle-1.0.zip', false],
    ['plain-classes', false],
    ['modular-classes', true],
  ])('reads %s as a module: %s', (name, expected) => {
    const { root } = workspace();

    expect(isModulePathEntry(path.join(root, name))).toBe(expected);
  });
});
