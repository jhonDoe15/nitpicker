import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCli } from '../../cli.mjs';
import { commit, fixtureGit } from '../../diff/git/test-support/git-repository.mjs';
import { insideProject } from '../support/inside-project.mjs';

const SNAPSHOT_REPORTS = 'reports/quality/snapshot';

export function copyFixtureRepository({ fixtureRoot, prefix, ignored }) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  cpSync(fixtureRoot, root, { recursive: true });
  rmSync(insideProject(root, 'nitpicker.config.json'), { force: true });
  writeFileSync(insideProject(root, '.gitignore'), `${ignored.join('\n')}\n`);
  fixtureGit(root, ['init', '-q', '--initial-branch=main']);
  commit(root, 'fixture');
  return root;
}

function run(root, cliArguments) {
  let text = '';
  const exitCode = runCli({
    arguments_: cliArguments,
    environment: { NO_COLOR: '1' },
    currentProjectRoot: root,
    stdout: { write: (chunk) => (text += chunk) },
    stderr: { write: (chunk) => (text += chunk) },
    progress: { write: () => undefined },
  });
  return { exitCode, text };
}

function readReport(root, name) {
  return JSON.parse(readFileSync(insideProject(root, `${SNAPSHOT_REPORTS}/${name}`), 'utf8'));
}

export function runInitThenAll(root) {
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
