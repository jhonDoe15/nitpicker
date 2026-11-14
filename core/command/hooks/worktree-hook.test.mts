import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../../cli.mts';
import { policy } from '../../diff/execution/test-support/analyzer-findings.mts';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { useCliFixtures } from '../test-support/cli-harness.mts';
import type { FixtureRepository } from '../test-support/fixture-types.mts';
import { fieldOf, parseJson, textOf } from '../../../shared/values/readers.mts';
import { checkoutModulePath as moduleSourcePath } from '../../../shared/paths/checkout-module.mjs';

const checkoutModulePath: (file: string) => string = moduleSourcePath;

const { createRepository, makeOutputRoot, makeTemporaryRoot } = useCliFixtures(nitpickerCli);

const CLI_URL = pathToFileURL(
  checkoutModulePath(path.resolve(import.meta.dirname, '../../cli.mjs')),
).href;

type HookFiles = {
  readonly baseRef: string;
  readonly outputRoot: string;
  readonly recordFile: string;
  readonly exitFile: string;
};

function probeReport(recordFile: string): string {
  return [
    "const { execFileSync } = await import('node:child_process');",
    "const { appendFileSync } = await import('node:fs');",
    "const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();",
    "const record = { cwd: process.cwd(), gitDir: git(['rev-parse', '--absolute-git-dir']),",
    "  head: git(['rev-parse', 'HEAD']) };",
    `appendFileSync(${JSON.stringify(recordFile)}, JSON.stringify(record) + '\\n');`,
    "process.stdout.write(JSON.stringify({ findings: [] }) + '\\n');",
  ].join('\n');
}

function hookScript({ baseRef, outputRoot, recordFile, exitFile }: HookFiles): string {
  const analyzer = {
    name: 'git-probe',
    version: '1.0.0',
    configurationHash: 'fixture-policy',
    exclusions: [],
    findingExitCodes: [1],
  };
  return [
    "import { writeFileSync } from 'node:fs';",
    `import { runCli } from ${JSON.stringify(CLI_URL)};`,
    `const analyzer = { ...${JSON.stringify(analyzer)}, createInvocation: ({ projectRoot }) => ({`,
    `  command: process.execPath, args: ['--input-type=module', '--eval', ${JSON.stringify(probeReport(recordFile))}],`,
    '  cwd: projectRoot }) };',
    'const exitCode = runCli({',
    `  arguments_: ${JSON.stringify(['--base', baseRef, '--output', outputRoot])},`,
    '  analyzers: [analyzer], currentProjectRoot: process.cwd(),',
    '  stdout: { write() {} }, stderr: { write() {} }, progress: { write() {} },',
    '});',
    `writeFileSync(${JSON.stringify(exitFile)}, String(exitCode));`,
  ].join('\n');
}

function installHook(project: FixtureRepository) {
  const scriptRoot = makeTemporaryRoot('nitpicker-worktree-hook-');
  const files = {
    script: path.join(scriptRoot, 'hook.mjs'),
    recordFile: path.join(scriptRoot, 'records.jsonl'),
    exitFile: path.join(scriptRoot, 'exit-code'),
  };
  writeFileSync(
    files.script,
    hookScript({ ...files, baseRef: project.baseRef, outputRoot: makeOutputRoot() }),
  );
  const hook = path.join(project.root, '.git/hooks/pre-commit');
  writeFileSync(
    hook,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(files.script)}\n`,
  );
  chmodSync(hook, 0o755);
  return files;
}

function linkedWorktree(project: FixtureRepository): string {
  const worktree = path.join(makeTemporaryRoot('nitpicker-linked-worktree-'), 'linked');
  fixtureGit(project.root, ['worktree', 'add', '-q', '-b', 'feature', worktree]);
  writeFiles(worktree, { 'src/main/a.ts': 'export const a = 2;\n' });
  commit(worktree, 'feature work');
  return worktree;
}

function cwdName(record: unknown): string {
  return path.basename(textOf(fieldOf(record, 'cwd')));
}

function snapshotRecords(recordFile: string): unknown[] {
  return readFileSync(recordFile, 'utf8')
    .trim()
    .split('\n')
    .map((line) => parseJson(line))
    .toSorted((left, right) => cwdName(left).localeCompare(cwdName(right)));
}

describe('nitpicker inside a pre-commit hook of a linked worktree', () => {
  it('runs git in each snapshot against that snapshot, not the worktree the hook names', () => {
    const project = createRepository({
      'quality-policy.json': policy(),
      'src/main/a.ts': 'export const a = 1;\n',
    });
    const worktree = linkedWorktree(project);
    const linkedGitDir = fixtureGit(worktree, ['rev-parse', '--absolute-git-dir']).trim();
    const { recordFile, exitFile } = installHook(project);
    writeFiles(worktree, { 'src/main/b.ts': 'export const b = 1;\n' });
    fixtureGit(worktree, ['add', '--', 'src/main/b.ts']);

    fixtureGit(worktree, ['commit', '-q', '-m', 'add b']);

    expect(readFileSync(exitFile, 'utf8')).toBe('0');
    const records = snapshotRecords(recordFile);
    expect(records.map(cwdName)).toEqual(['base', 'head']);
    expect(records.map((record) => fieldOf(record, 'gitDir'))).not.toContain(linkedGitDir);
    expect(fieldOf(records[0], 'head')).toBe(project.baseSha);
    expect(fixtureGit(worktree, ['show', '--name-only', '--format=', 'HEAD']).trim()).toBe(
      'src/main/b.ts',
    );
  });
});
