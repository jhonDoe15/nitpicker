import { readProjectMoves } from '../../../../core/diff/git/patches/project-moves.mjs';
import { GitCommandError, runGit } from '../../../../core/diff/git/repository/command.mjs';

function commitOf(root) {
  return runGit(root, ['rev-parse', 'HEAD']).trim();
}

function prefixOf(root) {
  return runGit(root, ['rev-parse', '--show-prefix']).trim();
}

function movedFiles({ projectRoot, baselineRoot }) {
  return readProjectMoves({
    repositoryRoot: projectRoot,
    mergeBaseSha: commitOf(baselineRoot),
    headSha: commitOf(projectRoot),
    projectRelativePath: prefixOf(projectRoot),
    baseProjectRelativePath: prefixOf(baselineRoot),
  }).files;
}

export function baselinePathsOf({ snapshot, baselineRoot, projectRoot }) {
  if (snapshot !== 'head' || baselineRoot === undefined) return new Map();
  try {
    return new Map([...movedFiles({ projectRoot, baselineRoot })].map(([from, to]) => [to, from]));
  } catch (error) {
    if (error instanceof GitCommandError) return new Map();
    throw error;
  }
}
