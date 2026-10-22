import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { featureVersion, jdkHomes } from '../../../maven/errorprone/maven-jdk.mjs';

const roots = [];

export const TESTS_FAILED = {
  tool: 'tests',
  rule: 'tests-failed',
  message: [
    'Tests fail in the head snapshot. Make each failing test pass:',
    '  demo.BrokenTest.parses: expected: <2> but was: <3>',
    'The static analyzers ran as usual; coverage and CRAP come from the tests that ran.',
    'Mutation testing (PIT) left out the test classes demo.BrokenTest.',
  ].join('\n'),
};

export function jdkHome(feature) {
  return jdkHomes().find((home) => {
    const result = spawnSync(path.join(home, 'bin', 'java'), ['-version'], { encoding: 'utf8' });
    return featureVersion(`${result.stderr}${result.stdout}`) === feature;
  });
}

function writeProject(release, files) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-jdk-${String(release)}-`));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function reportedFindings(findings) {
  return [
    ...new Set(
      findings
        .filter(
          (finding) =>
            finding.classification !== 'tool-error' &&
            finding.metric === undefined &&
            finding.tool !== 'test-runtime',
        )
        .map(({ tool, rule, path: file }) => `${tool} ${rule} ${path.basename(file)}`),
    ),
  ].sort();
}

export function analyzeAtLevel({ release, files, jdk, build, policy }) {
  const javaHome = jdkHome(jdk);
  if (javaHome !== undefined) {
    vi.stubEnv('JAVA_HOME', javaHome);
  }
  const findings = collectJavaFindings(writeProject(release, files), { ...build, policy });
  return {
    toolErrors: findings
      .filter((finding) => finding.classification === 'tool-error')
      .map(({ tool, rule, message }) => ({ tool, rule, message })),
    reported: reportedFindings(findings),
  };
}

export function removeLevelProjects() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
