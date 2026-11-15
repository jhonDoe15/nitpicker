import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { fakeAnalyzer, useCliFixtures } from '../test-support/cli-harness.mts';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);

function repositoryWithNestedPackage() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/a.ts': 'export const a = 1;\n',
    'e2e/package.json': '{"name":"e2e","version":"1.0.0"}\n',
    'e2e/quality-policy.json': policy(),
    'e2e/src/b.ts': 'export const b = 1;\n',
  });
  writeFiles(repository.root, {
    'src/a.ts': findingLine(finding({ identity: 'a-finding' })),
    'e2e/src/b.ts': findingLine(finding({ identity: 'b-finding' })),
  });
  return repository;
}

function runFrom(repository, folder, extra = []) {
  const output = captureOutput();
  const outputRoot = makeOutputRoot();
  const base = extra.includes('--all') ? [] : ['--base', repository.baseRef];
  runCli({
    arguments_: [...base, ...extra, '--output', outputRoot],
    environment: { NO_COLOR: '1' },
    workingDirectory: path.join(repository.root, folder),
    analyzers: [fakeAnalyzer()],
    snapshotAnalyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  const read = (name) => readFileSync(path.join(outputRoot, name), 'utf8');
  return {
    firstLine: output.stdoutText.split('\n')[0],
    reportHead: read('report.txt').split('\n').slice(0, 2),
    projectPath: JSON.parse(read('summary.json')).projectPath,
  };
}

describe('the project a run checked', () => {
  it('is named on the console when the run starts in a subfolder of the project', () => {
    const result = runFrom(repositoryWithNestedPackage(), 'src');

    expect(result.firstLine).toBe('Project: ..');
    expect(result.projectPath).toBe('.');
    expect(result.reportHead[1]).toBe('Base ref: comparison-base');
  });

  it('is named on the console and in the reports when a nested package becomes the project', () => {
    const result = runFrom(repositoryWithNestedPackage(), 'e2e/src');

    expect(result.firstLine).toBe('Project: ..');
    expect(result.projectPath).toBe('e2e');
    expect(result.reportHead).toEqual(['Nitpicker quality diff', 'Project: e2e']);
  });

  it('is named the same way by an --all run', () => {
    const result = runFrom(repositoryWithNestedPackage(), 'e2e/src', ['--all']);

    expect(result.firstLine).toBe('Project: ..');
    expect(result.projectPath).toBe('e2e');
    expect(result.reportHead).toEqual(['Nitpicker quality snapshot', 'Project: e2e']);
  });

  it('adds no line when the run starts in the project folder', () => {
    const result = runFrom(repositoryWithNestedPackage(), 'e2e');

    expect(result.firstLine).toBe('Base: comparison-base (argument)');
    expect(result.projectPath).toBe('e2e');
  });
});
