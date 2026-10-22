import path from 'node:path';
import { GitCommandError, runGit } from '../diff/git/repository/command.mjs';
import { commitTreeOverHead } from '../diff/git/repository/git.mjs';

export function indexCapture(indexFile) {
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
        `Cannot read the staged changes: ${error.message}. Resolve the conflicts and stage the files, or run nitpicker without --staged.`,
        { cause: error },
      );
    }
    throw error;
  }
}
