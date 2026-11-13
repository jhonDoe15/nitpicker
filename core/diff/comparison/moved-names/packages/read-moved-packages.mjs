import { readBaseFiles, readHeadFiles } from '../../../git/patches/project-moves.mjs';
import { movedPackages } from './moved-packages.mjs';

export function readMovedPackages(moves, snapshot) {
  const { repositoryRoot, mergeBaseSha, headSha, projectRelativePath, baseProjectRelativePath } =
    snapshot;
  return moves.files.size === 0
    ? new Map()
    : movedPackages({
        baseFiles: readBaseFiles({
          repositoryRoot,
          mergeBaseSha,
          projectRelativePath,
          baseProjectRelativePath,
        }),
        headFiles: readHeadFiles({ repositoryRoot, headSha, projectRelativePath }),
        renames: moves.files,
      });
}
