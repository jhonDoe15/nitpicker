import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { expectValidSarif } from '../../diff/reporting/test-support/format-checks/report-assertions.mts';
import { REPORT_FILE_NAMES } from '../../diff/reporting/reporters.mts';
import { SNAPSHOT_REPORT_FILE_NAMES } from '../../snapshot/reporters.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mts';
import type { FixtureRepository } from '../test-support/fixture-types.mts';
import { fieldAt } from '../../../scripts/json/fields.mts';
import { fieldOf, listOf, parseJson } from '../../../shared/values/readers.mts';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

function subfolderRepository() {
  return createRepository({
    'packages/my app/quality-policy.json': policy(),
    'packages/my app/src/old.ts': findingLine(finding({ identity: 'old-finding' })),
  });
}

function readSarif(outputRoot: string, name: string): unknown {
  return parseJson(readFileSync(path.join(outputRoot, name), 'utf8'));
}

function locations(log: unknown): unknown[][] {
  return listOf(fieldAt(log, 'runs', 0, 'results')).map((result) => [
    fieldOf(result, 'baselineState'),
    fieldAt(result, 'locations', 0, 'physicalLocation', 'artifactLocation'),
  ]);
}

function sourceRootOf(repository: FixtureRepository) {
  return {
    '%SRCROOT%': {
      uri: `${pathToFileURL(repository.root).href}/`,
      description: { text: 'The root of the git repository the findings are in.' },
    },
  };
}

function runInProject(repository: FixtureRepository, arguments_: readonly string[]) {
  const outputRoot = makeOutputRoot();
  const output = captureOutput();
  const analyzers = [fakeAnalyzer()];
  const exitCode = runCli({
    arguments_: [...arguments_, '--output', outputRoot],
    environment: {},
    currentProjectRoot: path.join(repository.root, 'packages/my app'),
    analyzers,
    snapshotAnalyzers: analyzers,
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, outputRoot };
}

describe('SARIF reports of a project in a repository subfolder', () => {
  it('writes repository-relative paths, the repository root and only the new finding of a comparison', () => {
    const repository = subfolderRepository();
    writeFiles(path.join(repository.root, 'packages/my app'), {
      'src/new.ts': findingLine(finding({ identity: 'new-finding' })),
    });

    const { exitCode, outputRoot } = runInProject(repository, ['--base', repository.baseRef]);

    expect(exitCode).toBe(1);
    expect(readdirSync(outputRoot).toSorted()).toEqual(REPORT_FILE_NAMES.toSorted());
    const current = readSarif(outputRoot, 'report.sarif');
    const baseline = readSarif(outputRoot, 'report-baseline.sarif');
    const logs = [current, baseline];
    expectValidSarif(current);
    expectValidSarif(baseline);
    expect(logs.map((log) => fieldAt(log, 'runs', 0, 'originalUriBaseIds'))).toEqual(
      logs.map(() => sourceRootOf(repository)),
    );
    expect(logs.map(locations)).toEqual(
      logs.map(() => [['new', { uri: 'packages/my%20app/src/new.ts', uriBaseId: '%SRCROOT%' }]]),
    );
  });
  it('writes every finding of the full run without a baseline state', () => {
    const repository = subfolderRepository();

    const { exitCode, outputRoot } = runInProject(repository, ['--all']);

    expect(exitCode).toBe(1);
    expect(readdirSync(outputRoot).toSorted()).toEqual(SNAPSHOT_REPORT_FILE_NAMES.toSorted());
    const log = readSarif(outputRoot, 'report.sarif');
    expectValidSarif(log);
    expect(fieldAt(log, 'runs', 0, 'originalUriBaseIds')).toEqual(sourceRootOf(repository));
    expect(locations(log)).toEqual([
      [undefined, { uri: 'packages/my%20app/src/old.ts', uriBaseId: '%SRCROOT%' }],
    ]);
  });
});
