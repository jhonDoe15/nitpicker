import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mjs';
import {
  finding,
  findingLine,
  policy,
} from '../../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fakeAnalyzer, useCliFixtures } from '../../command/test-support/cli-harness.mjs';

const { createRepository, makeOutputRoot, makeTemporaryRoot, runCli } =
  useCliFixtures(nitpickerCli);

function setup() {
  const repository = createRepository({
    'quality-policy.json': policy(),
    'src/main/clean.ts': 'export const clean = true;\n',
  });
  writeFiles(repository.root, {
    'src/main/added.ts': findingLine(finding({ identity: 'added-finding' })),
  });
  const cacheDirectory = makeTemporaryRoot('nitpicker-quick-head-cache-');
  return (flags) => {
    const output = captureOutput();
    const outputRoot = makeOutputRoot();
    const exitCode = runCli({
      arguments_: ['--base', repository.baseRef, '--output', outputRoot, ...flags],
      environment: { NITPICKER_CACHE_DIR: cacheDirectory, NO_COLOR: '1' },
      currentProjectRoot: repository.root,
      analyzers: [{ ...fakeAnalyzer('structure'), reportedTools: ['fake-quality-analyzer'] }],
      stdout: output.stdout,
      stderr: output.stderr,
      progress: output.stderr,
    });
    const newFindings = JSON.parse(
      readFileSync(path.join(outputRoot, 'new-findings.json'), 'utf8'),
    );
    return {
      exitCode,
      progress: output.stderrText
        .split('\n')
        .filter(Boolean)
        .map((line) => line.replace(` (${cacheDirectory}; use --no-cache to rerun)`, '')),
      newFindings: newFindings.map(({ identity }) => identity),
      writeHead: (files) => {
        writeFiles(repository.root, files);
      },
    };
  };
}

describe('the head side of a quick run in the findings cache', () => {
  it('reuses the head findings of an unchanged tree and runs again once the tree changes', () => {
    const run = setup();
    run(['--quick']);

    const repeated = run(['--quick']);
    repeated.writeHead({
      'src/main/other.ts': findingLine(finding({ identity: 'other-finding' })),
    });
    const changed = run(['--quick']);

    expect(repeated.progress).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head 1 analyzer cached',
    ]);
    expect([repeated.exitCode, repeated.newFindings]).toEqual([1, ['added-finding']]);
    expect(changed.progress).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head: running 1 analyzer',
    ]);
    expect(changed.newFindings.sort()).toEqual(['added-finding', 'other-finding']);
  });

  it('never caches the head of a full run', () => {
    const run = setup();
    run(['--quick']);

    expect(run([]).progress).toEqual([
      'nitpicker: base 1 analyzer cached',
      'nitpicker: head: running 1 analyzer',
    ]);
  });
});
