import { readFileSync } from 'node:fs';
import { runCli } from '../../cli.mjs';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mjs';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mjs';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { insideProject } from '../support/inside-project.mjs';

export function readText(root, name) {
  return readFileSync(insideProject(root, name), 'utf8');
}

export function useProjects() {
  const { temporaryRoot } = useGitFixtures();
  return function project(files, { repository = false } = {}) {
    const root = temporaryRoot('nitpicker-init-');
    writeFiles(root, files);
    if (repository) {
      fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    }
    return root;
  };
}

export function initWith(options, ...initArguments) {
  const output = captureOutput();
  const exitCode = runCli({
    ...options,
    arguments_: ['init', ...initArguments],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdoutText: output.stdoutText, stderrText: output.stderrText };
}

export function init(root, ...initArguments) {
  return initWith({ currentProjectRoot: root }, ...initArguments);
}
