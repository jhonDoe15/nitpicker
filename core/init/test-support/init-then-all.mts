import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../cli.mts';
import type { ExitCode } from '../../cli-context.mts';
import { parseJson } from '../../../shared/values/readers.mts';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mts';
import { insideProject } from '../support/inside-project.mts';

const SNAPSHOT_REPORTS = 'reports/quality/snapshot';

export function copyFixtureRepository({
  fixtureRoot,
  prefix,
  ignored,
}: {
  readonly fixtureRoot: string;
  readonly prefix: string;
  readonly ignored: readonly string[];
}): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  cpSync(fixtureRoot, root, { recursive: true });
  rmSync(insideProject(root, 'nitpicker.config.json'), { force: true });
  writeFileSync(insideProject(root, '.gitignore'), `${ignored.join('\n')}\n`);
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  commit(root, 'fixture');
  return root;
}

type CliRun = { exitCode: ExitCode; text: string };

function run(root: string, cliArguments: readonly string[]): CliRun {
  let text = '';
  const exitCode = runCli({
    arguments_: cliArguments,
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (chunk: string) => (text += chunk) },
    stderr: { write: (chunk: string) => (text += chunk) },
    progress: { write: () => undefined },
  });
  return { exitCode, text };
}

function readReport(root: string, name: string): unknown {
  return parseJson(readFileSync(insideProject(root, `${SNAPSHOT_REPORTS}/${name}`), 'utf8'));
}

type InitThenAll = {
  init: CliRun;
  all: CliRun;
  config: string;
  summary: unknown;
  toolErrors: unknown;
};

export function runInitThenAll(root: string): InitThenAll {
  const init = run(root, ['init']);
  const all = run(root, ['--all']);
  return {
    init,
    all,
    config: readFileSync(insideProject(root, 'nitpicker.config.json'), 'utf8'),
    summary: readReport(root, 'summary.json'),
    toolErrors: readReport(root, 'tool-errors.json'),
  };
}
