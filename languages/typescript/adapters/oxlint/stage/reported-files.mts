import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';

export type ReportedFile = { readonly filePath: string; readonly full: string };

export type ReportedFiles = (filename: string) => readonly ReportedFile[];

type RealPaths = { index?: ReadonlyMap<string, readonly string[]> };

function realPathOf(file: string): string | undefined {
  return statSync(file, { throwIfNoEntry: false }) === undefined ? undefined : realpathSync(file);
}

function realPathIndex(stage: string, listed: readonly string[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const file of listed) {
    const real = realPathOf(path.join(stage, file));
    if (real !== undefined) {
      index.set(real, [...(index.get(real) ?? []), file]);
    }
  }
  return index;
}

export function reportedFiles(stage: string, listed: readonly string[]): ReportedFiles {
  const realPaths: RealPaths = {};
  function linkedFiles(full: string): ReportedFile[] {
    realPaths.index ??= realPathIndex(stage, listed);
    return (realPaths.index.get(full) ?? []).map((file) => ({
      filePath: file.replaceAll('\\', '/'),
      full: path.join(stage, file),
    }));
  }
  return (filename) => {
    const full = path.resolve(stage, filename);
    if (full.startsWith(`${stage}${path.sep}`)) {
      return [{ filePath: filename.replaceAll('\\', '/'), full }];
    }
    return linkedFiles(full);
  };
}
