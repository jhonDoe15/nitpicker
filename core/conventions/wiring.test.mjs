import path from 'node:path';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGitRepository, removeGitRepositories } from '../diff/fixtures/git-repository.mjs';
import { runTasksInProcess } from '../diff/fixtures/in-process-analyzers.mjs';
import { cacheKey } from '../diff/findings-cache.mjs';
import { baseSetupResolver } from '../base-setup.mjs';
import { runCli } from '../cli.mjs';

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
  removeGitRepositories();
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
        '  Java indentation: 4 spaces (google-java-format --aosp) (used by 1 of 1 measured files)\n',
    );
  });

  it('gives the base the head conventions when the base has its own config', () => {
    const { root } = createGitRepository({ 'nitpicker.config.json': '{ "preset": "java" }\n' });
    const resolve = baseSetupResolver(
      { analyzers: [], stderr: { write: () => undefined } },
      { preset: 'java', exclude: ['build/**'] },
      { conventions: { 'java.indentation': '4' } },
    );

    const setup = resolve({ baseProjectRoot: root, analyzers: [] });

    expect(setup.headPolicy.conventions).toEqual({ 'java.indentation': '4' });
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
