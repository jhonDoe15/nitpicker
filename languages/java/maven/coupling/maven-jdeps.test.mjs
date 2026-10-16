import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runJdeps } from './maven-jdeps.mjs';

const roots = [];
const GRAPH = '   app.Main -> java.lang.Object   java.base\n';

function fakeJdeps(root, { stderr = '', exit = 0 } = {}) {
  const jdeps = path.join(root, 'jdk/bin/jdeps');
  mkdirSync(path.dirname(jdeps), { recursive: true });
  writeFileSync(
    jdeps,
    [
      '#!/bin/sh',
      `for arg in "$@"; do classes="$arg"; done`,
      `printf '%s\\n' "$@" > '${root}/args.txt'`,
      `(cd "$classes" && find . -type f | sort) > '${root}/staged.txt'`,
      `printf '%s' '${GRAPH}'`,
      `printf '%s' '${stderr}' >&2`,
      `exit ${String(exit)}`,
    ].join('\n'),
  );
  chmodSync(jdeps, 0o755);
  vi.stubEnv('JAVA_HOME', path.join(root, 'jdk'));
}

function project(files, jdeps) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-jdeps-test-'));
  roots.push(root);
  const outputDirectory = path.join(root, 'target/classes');
  for (const file of files) {
    mkdirSync(path.dirname(path.join(outputDirectory, file)), { recursive: true });
    writeFileSync(path.join(outputDirectory, file), 'class bytes');
  }
  const reportDir = path.join(root, 'report');
  mkdirSync(reportDir);
  fakeJdeps(root, jdeps);
  const buildDirectory = path.join(root, 'target');
  return { root, module: { basedir: root, buildDirectory, outputDirectory }, reportDir };
}

function read(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

function run(files, jdeps) {
  const { root, module, reportDir } = project(files, jdeps);
  runJdeps(module, reportDir);
  return {
    args: read(path.join(root, 'args.txt'))?.replaceAll(root, '<root>'),
    staged: read(path.join(root, 'staged.txt')),
    classes: read(path.join(reportDir, 'jdeps-classes.txt')),
    graph: read(path.join(reportDir, 'jdeps.txt')),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe.skipIf(process.platform === 'win32')('runJdeps', () => {
  it('analyzes the class directory of a module without a descriptor in place', () => {
    expect(run(['app/Main.class', 'app/package-info.class'])).toEqual({
      args: '-verbose:class\n-filter:none\n<root>/target/classes\n',
      staged: './app/Main.class\n./app/package-info.class\n',
      classes: 'app.Main\n',
      graph: GRAPH,
    });
  });

  it('analyzes a copy of a modular class directory without its module descriptor', () => {
    const result = run([
      'module-info.class',
      'app/Main.class',
      'app/impl/Impl.class',
      'app/messages.properties',
      'META-INF/MANIFEST.MF',
    ]);

    expect({
      ...result,
      args: result.args.replace(/\/nitpicker-jdeps-[^/]+\//u, '/<staged>/'),
    }).toEqual({
      args: '-verbose:class\n-filter:none\n<root>/target/<staged>/classes\n',
      staged: './app/Main.class\n./app/impl/Impl.class\n',
      classes: 'app.Main\napp.impl.Impl\n',
      graph: GRAPH,
    });
  });

  it('leaves a dangling symbolic link out of the staged copy', () => {
    const { root, module, reportDir } = project(['module-info.class', 'app/Main.class']);
    symlinkSync(path.join(root, 'gone'), path.join(module.outputDirectory, 'app/Gone.class'));

    runJdeps(module, reportDir);

    expect(read(path.join(root, 'staged.txt'))).toBe('./app/Main.class\n');
    expect(read(path.join(reportDir, 'jdeps.txt'))).toBe(GRAPH);
  });

  it('stages in the temporary folder when the class directory holds the build directory', () => {
    const { root, module, reportDir } = project([]);
    const shared = { ...module, outputDirectory: module.buildDirectory };
    for (const file of ['module-info.class', 'app/Main.class']) {
      mkdirSync(path.dirname(path.join(shared.outputDirectory, file)), { recursive: true });
      writeFileSync(path.join(shared.outputDirectory, file), 'class bytes');
    }

    runJdeps(shared, reportDir);

    const staged = path.dirname(read(path.join(root, 'args.txt')).split('\n')[2]);
    expect(path.dirname(staged)).toBe(tmpdir());
    expect(path.basename(staged)).toMatch(/^nitpicker-jdeps-\w{6}$/u);
    expect(existsSync(staged)).toBe(false);
    expect(read(path.join(root, 'staged.txt'))).toBe('./app/Main.class\n');
    expect(read(path.join(reportDir, 'jdeps.txt'))).toBe(GRAPH);
  });

  it('removes the staged copy once jdeps finishes', () => {
    const { root, module, reportDir } = project(['module-info.class', 'app/Main.class']);

    runJdeps(module, reportDir);

    expect(readdirSync(path.join(root, 'target'))).toEqual(['classes']);
  });

  it('writes an empty graph without running jdeps when there are no classes', () => {
    expect(run(['module-info.class'])).toEqual({
      args: undefined,
      staged: undefined,
      classes: '',
      graph: '',
    });
  });

  it('reports the error lines of a failed run without JVM notices', () => {
    const stderr = [
      'Picked up JAVA_TOOL_OPTIONS: -Xmx1g',
      'Warning: split package app',
      'Exception in thread "main" java.lang.IllegalStateException: broken',
      '\tat com.sun.tools.jdeps.Main.main(Main.java:1)',
      'Caused by: java.io.IOException: unreadable',
    ].join('\n');
    const { module, reportDir } = project(['app/Main.class'], { stderr, exit: 2 });

    expect(() => {
      runJdeps(module, reportDir);
    }).toThrow(
      new Error(
        [
          'jdeps failed with exit code 2: Exception in thread "main" java.lang.IllegalStateException: broken',
          'Caused by: java.io.IOException: unreadable',
        ].join('\n'),
      ),
    );
  });

  it('reports the first stderr lines when none name an error', () => {
    const stderr = ['NOTE: Picked up JDK_JAVA_OPTIONS: -Xss1m', 'Module app not found'].join('\n');
    const { module, reportDir } = project(['app/Main.class'], { stderr, exit: 1 });

    expect(() => {
      runJdeps(module, reportDir);
    }).toThrow(new Error('jdeps failed with exit code 1: Module app not found'));
  });
});
