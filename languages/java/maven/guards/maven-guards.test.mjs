import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { argumentFileToken } from '../maven-command.mjs';
import { runGuards } from './maven-guards.mjs';

const roots = [];
const TOOLS = { forbiddenapis: ['/tools/forbiddenapis.jar', '/tools/asm.jar'] };

function workspace() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-guards-'));
  roots.push(root);
  return root;
}

function fakeJava(root, status) {
  const home = path.join(root, 'jdk');
  mkdirSync(path.join(home, 'bin'), { recursive: true });
  const java = path.join(home, 'bin/java');
  writeFileSync(
    java,
    [
      '#!/bin/sh',
      `cat "\${1#@}" > '${path.join(root, 'java-arguments')}'`,
      "printf 'forbidden: String#getBytes()\\n'",
      "printf '1 error\\n' >&2",
      `exit ${String(status)}`,
    ].join('\n'),
  );
  chmodSync(java, 0o755);
  vi.stubEnv('JAVA_HOME', home);
}

function moduleOf(root, files) {
  const basedir = path.join(root, 'app');
  const outputDirectory = path.join(basedir, 'target/classes');
  mkdirSync(basedir, { recursive: true });
  for (const name of files) {
    mkdirSync(path.dirname(path.join(outputDirectory, name)), { recursive: true });
    writeFileSync(path.join(outputDirectory, name), 'x');
  }
  writeFileSync(path.join(basedir, 'pom.xml'), '<project><artifactId>app</artifactId></project>');
  mkdirSync(path.join(basedir, 'target/nitpicker'), { recursive: true });
  return {
    module: {
      basedir,
      buildDirectory: path.join(basedir, 'target'),
      pomFile: path.join(basedir, 'pom.xml'),
      outputDirectory,
      sourceRoots: [],
      testSourceRoots: [],
      compiler: { release: undefined, source: undefined, target: undefined, args: [] },
    },
    reportDir: path.join(basedir, 'target/nitpicker'),
  };
}

function guards(root, { files, mainCompile }) {
  const { module, reportDir } = moduleOf(root, files);
  runGuards(
    { module, reportDir, tools: TOOLS, classpaths: { mainCompile, dependencies: [] } },
    { projectRoot: root, baselineRoot: undefined, reactor: [] },
  );
  return reportDir;
}

function expectedArguments({ module, libraries }) {
  return [
    '-cp',
    TOOLS.forbiddenapis.join(path.delimiter),
    'de.thetaphi.forbiddenapis.cli.CliMain',
    '-d',
    module,
    '-c',
    libraries,
    '-f',
    path.join(GRADLE_DIRECTORY, 'rules/forbidden-apis.txt'),
    '--allowmissingclasses',
  ]
    .map((token) => argumentFileToken(token))
    .join('\n');
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

describe.skipIf(process.platform === 'win32')('runGuards forbiddenapis', () => {
  it.each([0, 1])('writes the forbiddenapis output when it exits with %i', (status) => {
    const root = workspace();
    fakeJava(root, status);

    const reportDir = guards(root, { files: ['demo/App.class'], mainCompile: [] });

    expect(readFileSync(path.join(reportDir, 'forbidden-apis.txt'), 'utf8')).toBe(
      'forbidden: String#getBytes()\n1 error\n',
    );
  });

  it('fails with the tool output when forbiddenapis exits with any other status', () => {
    const root = workspace();
    fakeJava(root, 2);

    expect(() => guards(root, { files: ['demo/App.class'], mainCompile: [] })).toThrow(
      new Error('forbiddenapis failed with exit code 2: 1 error\nforbidden: String#getBytes()'),
    );
  });

  it('passes the classes, the rule file and only the libraries that exist', () => {
    const root = workspace();
    fakeJava(root, 0);
    const first = path.join(root, 'first.jar');
    const second = path.join(root, 'second.jar');
    writeFileSync(first, '');
    writeFileSync(second, '');

    guards(root, {
      files: ['demo/App.class'],
      mainCompile: [first, path.join(root, 'missing.jar'), second],
    });

    expect(readFileSync(path.join(root, 'java-arguments'), 'utf8')).toBe(
      expectedArguments({
        module: path.join(root, 'app/target/classes'),
        libraries: [first, second].join(path.delimiter),
      }),
    );
  });

  it('passes an empty library list when none of the libraries exist', () => {
    const root = workspace();
    fakeJava(root, 0);

    guards(root, { files: ['demo/App.class'], mainCompile: [path.join(root, 'missing.jar')] });

    expect(readFileSync(path.join(root, 'java-arguments'), 'utf8')).toBe(
      expectedArguments({ module: path.join(root, 'app/target/classes'), libraries: '' }),
    );
  });

  it.each([
    ['only resources', ['application.properties', 'static/index.html']],
    ['no output at all', []],
  ])('does not run forbiddenapis or write its report for a module with %s', (_, files) => {
    const root = workspace();
    fakeJava(root, 0);

    const reportDir = guards(root, { files, mainCompile: [] });

    expect(existsSync(path.join(reportDir, 'forbidden-apis.txt'))).toBe(false);
    expect(existsSync(path.join(root, 'java-arguments'))).toBe(false);
  });
});
