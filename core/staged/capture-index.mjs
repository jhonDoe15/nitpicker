import path from 'node:path';
import { GitCommandError, runGit } from '../diff/git/repository/command.mjs';
import { commitTreeOverHead } from '../diff/git/repository/git.mjs';
import { stagedConfigDrift, stagedConfigNotice } from './config-drift.mjs';

function stagedRunNotice(projectRoot, indexFile) {
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

export function stagedCapture({ staged, indexFile, projectRoot, stderr }) {
  if (!staged) {
    return undefined;
  }
  stderr.write(stagedRunNotice(projectRoot, indexFile));
  return indexCapture(indexFile);
}

function indexCapture(indexFile) {
  return function captureIndex(repositoryRoot, headSha) {
    const environment =
      indexFile === undefined
        ? undefined
        : { GIT_INDEX_FILE: path.resolve(repositoryRoot, indexFile) };
    return commitTreeOverHead(repositoryRoot, writeIndexTree(repositoryRoot, environment), headSha);
  };
}

function writeIndexTree(repositoryRoot, environment) {
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
