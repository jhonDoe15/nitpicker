import path from 'node:path';
import { GitCommandError, runGit } from '../diff/git/repository/command.mjs';
import { commitTreeOverHead } from '../diff/git/repository/git.mjs';
import { stagedConfigDrift, stagedConfigNotice } from './config-drift.mjs';

function stagedRunNotice(projectRoot: string, indexFile: string | undefined): string {
  const repositoryRoot = runGit(projectRoot, ['rev-parse', '--show-toplevel']).trim();
  try {
    return stagedConfigNotice(stagedConfigDrift(repositoryRoot, indexFile));
  } catch (error) {
    if (error instanceof GitCommandError) {
      return '';
    }
    throw error;
  }
}

export function withIndexFile<Cli extends { readonly environment: NodeJS.ProcessEnv }>(
  cli: Cli,
  detached: NodeJS.ProcessEnv,
): Cli & { readonly indexFile: string | undefined } {
  const { GIT_INDEX_FILE: indexFile = detached['GIT_INDEX_FILE'] } = cli.environment;
  return { ...cli, indexFile };
}

export type CaptureHead = (repositoryRoot: string, headSha: string) => unknown;

type StagedRun = {
  readonly options: { readonly staged: boolean };
  readonly indexFile: string | undefined;
  readonly stderr: { write(text: string): unknown };
};

export function stagedCapture(
  { options, indexFile, stderr }: StagedRun,
  projectRoot: string,
): CaptureHead | undefined {
  if (!options.staged) {
    return undefined;
  }
  stderr.write(stagedRunNotice(projectRoot, indexFile));
  return indexCapture(indexFile);
}

function indexCapture(indexFile: string | undefined): CaptureHead {
  return function captureIndex(repositoryRoot, headSha): unknown {
    const environment =
      indexFile === undefined
        ? undefined
        : { GIT_INDEX_FILE: path.resolve(repositoryRoot, indexFile) };
    return commitTreeOverHead(repositoryRoot, writeIndexTree(repositoryRoot, environment), headSha);
  };
}

function writeIndexTree(
  repositoryRoot: string,
  environment: Readonly<Record<string, string>> | undefined,
): string {
  try {
    return runGit(repositoryRoot, ['write-tree'], { environment }).trim();
  } catch (error) {
    if (error instanceof GitCommandError) {
      throw new Error(
        [
          `Cannot read the staged changes: ${error.message}.`,
          ' Resolve the conflicts and stage the files, or run nitpicker without --staged.',
        ].join(''),
        { cause: error },
      );
    }
    throw error;
  }
}
