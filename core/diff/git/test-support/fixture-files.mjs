import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeFiles(root, files) {
  for (const [relativePath, contents] of Object.entries(files)) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, contents);
  }
}

export function renameFile(root, oldPath, newPath) {
  const destination = path.join(root, newPath);
  mkdirSync(path.dirname(destination), { recursive: true });
  renameSync(path.join(root, oldPath), destination);
}

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}
