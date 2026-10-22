import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import { finding, findingLine, policy } from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { expectValidSarif } from '../../diff/reporting/test-support/report-assertions.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

function subfolderRepository() {
  return createRepository({
    'packages/my app/quality-policy.json': policy(),
    'packages/my app/src/old.ts': findingLine(finding({ identity: 'old-finding' })),
  });
}

function readSarif(outputRoot) {
  return JSON.parse(readFileSync(path.join(outputRoot, 'report.sarif'), 'utf8'));
}

function expectSourceRoot(log, repositoryRoot) {
  expect(log.runs[0].originalUriBaseIds).toEqual({
    '%SRCROOT%': { uri: `${pathToFileURL(repositoryRoot).href}/packages/my%20app/` },
  });
}

describe('SARIF reports of a project in a repository subfolder', () => {
  it('marks the new finding of a comparison and roots the paths at the project folder', () => {
    const repository = subfolderRepository();
    const projectRoot = path.join(repository.root, 'packages/my app');
    writeFiles(projectRoot, {
      'src/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });
    const outputRoot = makeOutputRoot();
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', outputRoot],
      environment: {},
      currentProjectRoot: projectRoot,
      analyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    const log = readSarif(outputRoot);
    expectValidSarif(log);
    expectSourceRoot(log, repository.root);
    expect(
      log.runs[0].results.map((result) => [
        result.baselineState,
        result.locations[0].physicalLocation.artifactLocation,
      ]),
    ).toEqual([['new', { uri: 'src/new.ts', uriBaseId: '%SRCROOT%' }]]);
  });
  it('writes every finding of the full run without a baseline state', () => {
    const repository = subfolderRepository();
    const projectRoot = path.join(repository.root, 'packages/my app');
    const outputRoot = makeOutputRoot();
    const output = captureOutput();

    const exitCode = runCli({
      arguments_: ['--all', '--output', outputRoot],
      environment: {},
      currentProjectRoot: projectRoot,
      snapshotAnalyzers: [fakeAnalyzer()],
      stdout: output.stdout,
      stderr: output.stderr,
    });

    expect(exitCode).toBe(1);
    const log = readSarif(outputRoot);
    expectValidSarif(log);
    expectSourceRoot(log, repository.root);
    expect(
      log.runs[0].results.map((result) => [
        result.ruleId,
        result.baselineState,
        result.locations[0].physicalLocation.artifactLocation.uri,
      ]),
    ).toEqual([['fake-quality-analyzer/fixture-rule', undefined, 'src/old.ts']]);
  });
});
