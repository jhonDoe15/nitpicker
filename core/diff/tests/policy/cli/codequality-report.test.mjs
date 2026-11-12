import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../../cli.mjs';
import { useCliFixtures, fakeAnalyzer } from '../../../../command/test-support/cli-harness.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mjs';
import { writeFiles } from '../../../git/test-support/fixture-files.mjs';
import { commit } from '../../../git/test-support/git-repository.mjs';
import { captureOutput } from '../../../reporting/test-support/output-capture.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

function repositoryWithNewFinding() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/stable.ts': 'export const stable = true;\n',
  });
  writeFiles(repository.root, {
    'src/main/new.ts': findingLine(finding({ identity: 'introduced', message: 'Fixture' })),
  });
  commit(repository.root, 'introduce finding');
  return repository;
}

function issuesAfter(arguments_, analyzers) {
  const repository = repositoryWithNewFinding();
  const outputRoot = makeOutputRoot();
  const output = captureOutput();
  const exitCode = runCli({
    arguments_: [...arguments_(repository), '--output', outputRoot],
    currentProjectRoot: repository.root,
    ...analyzers,
    stdout: output.stdout,
    stderr: output.stderr,
  });
  const issues = JSON.parse(readFileSync(path.join(outputRoot, 'codequality.json'), 'utf8'));
  return {
    exitCode,
    issues: issues.map(({ fingerprint, ...issue }) => ({
      ...issue,
      fingerprint: /^[0-9a-f]{64}$/u.test(fingerprint),
    })),
  };
}

const ISSUE = {
  description: 'Fixture',
  check_name: 'fake-quality-analyzer/fixture-rule',
  fingerprint: true,
  severity: 'major',
  location: { path: 'src/main/new.ts', lines: { begin: 1 } },
};

describe('the GitLab Code Quality report', () => {
  it('lists the new findings of a comparison', () => {
    const result = issuesAfter((repository) => ['--base', repository.baseRef], {
      analyzers: [fakeAnalyzer()],
    });

    expect(result).toEqual({ exitCode: 1, issues: [ISSUE] });
  });

  it('lists every finding of a full run', () => {
    const result = issuesAfter(() => ['--all'], { snapshotAnalyzers: [fakeAnalyzer()] });

    expect(result).toEqual({ exitCode: 1, issues: [ISSUE] });
  });
});
