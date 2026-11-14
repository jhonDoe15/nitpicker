import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseJson } from '../../../../shared/values/readers.mts';

export type FileMap = Readonly<Record<string, string>>;

export function writeFiles(root: string, files: FileMap): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

export function renameFile(root: string, oldPath: string, newPath: string): void {
  const destination = path.join(root, newPath);
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(path.join(root, oldPath), destination);
}

export function readJson(root: string, relativePath: string): unknown {
  return parseJson(readFileSync(path.join(root, relativePath), 'utf8'));
}
