import path from 'node:path';
import { globMatcher, toPosix } from '../layout.mjs';
import { isGenerated } from '../unused-api/context.mjs';
import { exportedNodes } from './syntax/exports.mjs';

function isOwned(info, sourceFile, layout) {
  return (
    info !== undefined &&
    info.insideProject &&
    info.role === 'production' &&
    layout.isSourceFile(info.path) &&
    !layout.isGeneratedPath(info.path) &&
    !isGenerated(sourceFile)
  );
}

export function ownedFiles(context, layout) {
  const sorted = context.files.toSorted((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  return sorted.flatMap((sourceFile) => {
    const info = context.fileInfo.get(sourceFile.fileName);
    return isOwned(info, sourceFile, layout)
      ? [{ sourceFile, path: info.path, exported: exportedNodes(context.checker, sourceFile) }]
      : [];
  });
}

export function moduleFacts(files, layout) {
  const entries = (layout.entryPoints ?? []).map((glob) => globMatcher(glob));
  return files.map((file) => ({
    file: file.path,
    role: 'production',
    ...(entries.some((matcher) => matcher.test(file.path)) ? { entry: true } : {}),
  }));
}

export function packageFacts(packagesInfo, projectRoot) {
  const inside = packagesInfo.packages
    .map((entry) => ({
      root: toPosix(path.relative(projectRoot, entry.dir)),
      published: entry.published,
    }))
    .filter(({ root }) => !root.startsWith('..') && !path.isAbsolute(root));
  return inside.length > 1 || inside.some(({ published }) => published) ? inside : [];
}
