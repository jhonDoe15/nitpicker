import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  analyzeJavaSnapshot,
  readRunnerPolicy,
} from '../../languages/java/adapters/java-runner.mjs';
import { resolveHeadPolicy } from '../../languages/typescript/preset/head-policy.mjs';
import { withHeadPolicyFile } from '../../shared/head-policy.mjs';
import { useGitFixtures } from '../diff/git/test-support/git-repository.mjs';
import { resolveComparison } from '../diff/git/repository/git.mjs';
import { comparisonPolicy } from './resolve.mjs';

const { createGitRepository } = useGitFixtures();

const fakeGradle = path.resolve(
  import.meta.dirname,
  '../../languages/java/adapters/fixtures/fake-gradle.mjs',
);
const indented = (width) =>
  `package demo;\n\npublic final class A {\n${' '.repeat(width)}private int a;\n}\n`;
const projects = [];

afterEach(() => {
  for (const root of projects.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function gradleProperties(width) {
  const { root } = createGitRepository({
    'nitpicker.config.json': '{ "preset": "kotlin" }\n',
    'src/main/java/demo/A.java': indented(width),
    'src/main/kotlin/demo/B.kt': 'package demo\n\nclass B\n',
  });
  const config = { preset: 'kotlin' };
  const headPolicy = comparisonPolicy(
    {
      config,
      currentProjectRoot: root,
      headPolicy: resolveHeadPolicy(config, root),
      stdout: { write: () => undefined },
      repositoryRoot: root,
      base: { baseRef: 'main' },
    },
    resolveComparison,
  );
  const policy = withHeadPolicyFile(
    headPolicy,
    (file) =>
      readRunnerPolicy(['--project-root', root, '--preset', 'kotlin'], { NITPICKER_POLICY: file })
        .policy,
  );
  const project = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-kotlin-style-')));
  projects.push(project);
  analyzeJavaSnapshot(project, { gradle: fakeGradle, policy });
  return JSON.parse(readFileSync(path.join(project, 'build/gradle-args.json'), 'utf8'));
}

describe('the Java style of a kotlin-preset project', () => {
  it('follows 4-space Java files with --aosp and keeps Google for 2-space ones', () => {
    const style = (width) =>
      gradleProperties(width).filter((argument) => argument.startsWith('-Pnitpicker.java.style'));

    expect(style(4)).toEqual(['-Pnitpicker.java.style=aosp']);
    expect(style(2)).toEqual([]);
  });
});
