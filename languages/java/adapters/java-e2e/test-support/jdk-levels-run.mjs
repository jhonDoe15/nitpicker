import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { collectJavaFindings } from '../../java-diff.mjs';
import { installedJdks } from '../../../maven/errorprone/maven-jdk.mjs';

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
  return installedJdks().find((jdk) => jdk.feature === feature)?.home;
}

function writeProject(release, files) {
  const root = mkdtempSync(path.join(tmpdir(), `nitpicker-jdk-${String(release)}-`));
  for (const [file, text] of Object.entries(files)) {
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`${file} is outside the project`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, text);
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

export function analyzeAtLevel({ release, files, jdk, build, policy }, roots) {
  const javaHome = jdkHome(jdk);
  if (javaHome !== undefined) {
    vi.stubEnv('JAVA_HOME', javaHome);
  }
  const root = writeProject(release, files);
  roots.push(root);
  const findings = collectJavaFindings(root, { ...build, policy });
  return {
    toolErrors: findings
      .filter((finding) => finding.classification === 'tool-error')
      .map(({ tool, rule, message }) => ({ tool, rule, message })),
    reported: reportedFindings(findings),
  };
}

export function removeLevelProjects(roots) {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
