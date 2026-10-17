import path from 'node:path';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { runTasksInProcess } from '../diff/execution/test-support/in-process-analyzers.mjs';
import { cacheKey } from '../diff/cache/findings-cache.mjs';
import { baseSetupResolver } from '../command/policy-review/base-setup.mjs';
import { runCli } from '../cli.mjs';

const { createGitRepository } = useGitFixtures();

const fakeGradle = path.resolve(
  import.meta.dirname,
  '../../languages/java/adapters/fixtures/fake-gradle.mjs',
);
const fourSpaces = 'package demo;\n\npublic final class A {\n    private int a;\n}\n';
const outputs = [];
let previousGradle;

beforeEach(() => {
  previousGradle = process.env.NITPICKER_GRADLE;
  process.env.NITPICKER_GRADLE = fakeGradle;
});

afterEach(() => {
  if (previousGradle === undefined) {
    delete process.env.NITPICKER_GRADLE;
  } else {
    process.env.NITPICKER_GRADLE = previousGradle;
  }
  for (const root of outputs.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('conventions in a run', () => {
  it('prints what a Java comparison follows', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "preset": "java" }\n',
      'build.gradle': "plugins { id 'java' }\n",
      'src/main/java/demo/A.java': fourSpaces,
    });
    const reports = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-conventions-out-')));
    outputs.push(reports);
    let out = '';

    const exitCode = runCli({
      arguments_: ['--base', 'main', '--output', reports],
      environment: { NO_COLOR: '1' },
      currentProjectRoot: root,
      stdout: { write: (value) => (out += value) },
      stderr: { write: () => undefined },
      progress: { write: () => undefined },
      runTasks: runTasksInProcess,
    });

    expect(exitCode, out).toBe(0);
    expect(out).toContain(
      "Following this project's conventions:\n" +
        '  Java indentation: 4 spaces (used by 1 of 1 measured files)\n',
    );
  });

  it('reports a config error before measuring anything', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-conventions-no-git-')));
    outputs.push(root);
    writeFileSync(
      path.join(root, 'nitpicker.config.json'),
      '{ "preset": "java", "disable": ["nope"] }\n',
    );
    let errors = '';

    const exitCode = runCli({
      arguments_: [],
      environment: {},
      currentProjectRoot: root,
      stdout: { write: () => undefined },
      stderr: { write: (value) => (errors += value) },
      progress: { write: () => undefined },
      runTasks: runTasksInProcess,
    });

    expect(exitCode).toBe(2);
    expect(errors).toBe(
      'nitpicker failed: nitpicker.config.json: "disable" names unknown analyzers: nope. Known analyzers: java\n',
    );
  });

  it('gives the base the head conventions when the base has its own config', () => {
    const { root } = createGitRepository({ 'nitpicker.config.json': '{ "preset": "java" }\n' });
    const resolve = baseSetupResolver(
      { injectedAnalyzers: [], stderr: { write: () => undefined } },
      { preset: 'java', exclude: ['build/**'] },
      { conventions: { 'java.indentation': '4' } },
    );

    const setup = resolve({ baseProjectRoot: root, headSnapshotRoot: root, analyzers: [] });

    expect(setup.headPolicy.conventions).toEqual({ 'java.indentation': '4' });
  });

  it('applies a base config that disables an analyzer of the injected set', () => {
    const { root } = createGitRepository({
      'nitpicker.config.json': '{ "preset": "java", "disable": ["second"] }\n',
    });
    const warnings = [];
    const analyzer = (name) => ({ name, version: '1', configurationHash: name });
    const resolve = baseSetupResolver(
      {
        injectedAnalyzers: [analyzer('first'), analyzer('second')],
        stderr: { write: (text) => warnings.push(text) },
      },
      { preset: 'java' },
      {},
    );

    const setup = resolve({
      baseProjectRoot: root,
      headSnapshotRoot: root,
      analyzers: [analyzer('first')],
    });

    expect(warnings).toEqual([]);
    expect(setup.analyzers.map(({ name }) => name)).toEqual(['first']);
  });

  it('keys cached findings by the conventions followed', () => {
    const key = (conventions) =>
      cacheKey({
        mergeBaseSha: 'a'.repeat(40),
        projectRelativePath: '.',
        analyzer: { name: 'java', version: '1', configurationHash: 'h' },
        headPolicy: { exclude: [], conventions },
      });

    expect(key({ 'java.indentation': '2' })).not.toBe(key({ 'java.indentation': '4' }));
  });
});
