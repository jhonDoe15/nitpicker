import type TypeScript from 'typescript';
import { globMatcher } from '../unused-api/test-only/typed/layout-views.mts';
import { exportedNodes } from './syntax/exports.mts';
import type { ModuleFact, OwnedFile } from './design-types.mts';
import {
  type DesignContext,
  type DesignLayout,
  type FileInfo,
  isGenerated,
} from './typed/views.mts';

function isOwned(
  info: FileInfo | undefined,
  sourceFile: TypeScript.SourceFile,
  layout: DesignLayout,
): info is FileInfo {
  return (
    info !== undefined &&
    info.insideProject &&
    info.role === 'production' &&
    layout.isSourceFile(info.path) &&
    !layout.isGeneratedPath(info.path) &&
    !isGenerated(sourceFile)
  );
}

export function ownedFiles(context: DesignContext, layout: DesignLayout): OwnedFile[] {
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

export function moduleFacts(files: readonly OwnedFile[], layout: DesignLayout): ModuleFact[] {
  const entries = (layout.entryPoints ?? []).map((glob) => globMatcher(glob));
  return files.map((file) => ({
    file: file.path,
    role: 'production',
    ...(entries.some((matcher) => matcher.test(file.path)) ? { entry: true } : {}),
  }));
}
