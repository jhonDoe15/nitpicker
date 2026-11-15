import { readFileSync } from 'node:fs';
import { runCli } from '../../cli.mts';
import { captureOutput } from '../../diff/reporting/test-support/output-capture.mts';
import { writeFiles } from '../../diff/git/test-support/fixture-files.mts';
import { fixtureGit, useGitFixtures } from '../../diff/git/test-support/git-repository.mts';
import type { FileMap } from '../../diff/git/test-support/fixture-files.mts';
import type { CliInput, ExitCode } from '../../cli-context.mts';
import { insideProject } from '../support/inside-project.mts';

type InitResult = { exitCode: ExitCode; stdoutText: string; stderrText: string };

export function readText(root: string, name: string): string {
  return readFileSync(insideProject(root, name), 'utf8');
}

export function withPeers(
  versions: Readonly<Record<string, string>>,
  manifest: object = {},
): FileMap & { readonly 'package.json': string } {
  const installed = Object.entries(versions).map(([name, version]): [string, string] => [
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version }),
  ]);
  return {
    'package.json': JSON.stringify({ ...manifest, devDependencies: versions }),
    ...Object.fromEntries(installed),
  };
}

export function useProjects(): (
  files: FileMap,
  options?: { readonly repository: boolean },
) => string {
  const { temporaryRoot } = useGitFixtures();
  return function project(
    files: FileMap,
    { repository }: { readonly repository: boolean } = { repository: false },
  ): string {
    const root = temporaryRoot('nitpicker-init-');
    writeFiles(root, files);
    if (repository) {
      fixtureGit(root, ['init', '-q', '--initial-branch=main']);
    }
    return root;
  };
}

export function initWith(
  options: CliInput & { readonly nodeVersion?: string },
  ...initArguments: string[]
): InitResult {
  const output = captureOutput();
  const exitCode = runCli({
    ...options,
    arguments_: ['init', ...initArguments],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return { exitCode, stdoutText: output.stdoutText, stderrText: output.stderrText };
}

export function init(root: string, ...initArguments: string[]): InitResult {
  return initWith({ currentProjectRoot: root }, ...initArguments);
}
