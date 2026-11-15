import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../../../cli.mts';
import type {
  FixtureAnalyzer,
  FixtureRepository,
} from '../../../../command/test-support/fixture-types.mts';
import {
  fieldOf,
  listOf,
  objectOf,
  parseJson,
  textOf,
} from '../../../../../shared/values/readers.mts';
import { useCliFixtures, fakeAnalyzer } from '../../../../command/test-support/cli-harness.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../../execution/test-support/analyzer-findings.mts';
import { writeFiles } from '../../../git/test-support/fixture-files.mts';
import { commit } from '../../../git/test-support/git-repository.mts';
import { captureOutput } from '../../../reporting/test-support/output-capture.mts';

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

function issuesAfter(
  arguments_: (repository: FixtureRepository) => readonly string[],
  analyzers: {
    readonly analyzers?: readonly FixtureAnalyzer[];
    readonly snapshotAnalyzers?: readonly FixtureAnalyzer[];
  },
) {
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
  const issues = listOf(parseJson(readFileSync(path.join(outputRoot, 'codequality.json'), 'utf8')));
  return {
    exitCode,
    issues: issues.map((issue) => ({
      ...objectOf(issue),
      fingerprint: /^[0-9a-f]{64}$/u.test(textOf(fieldOf(issue, 'fingerprint'))),
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
