import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ancestorDirectories } from '../../../../../shared/filesystem.mts';
import { hasRepositoryMarker } from '../../../../../shared/project-files/tree-walk.mts';
import { projectFilesUnder } from '../../../../../shared/project-files/project-files.mts';
import { isTestSourceIn } from '../rules/support/io/implementations.mts';

const CODE = /\.(?:[cm]?[jt]sx?)$/u;
const written = new Map<string, string>();
const tops = new Map<string, string>();

function posix(file: string): string {
  return file.replaceAll('\\', '/');
}

function listingTop(root: string): string {
  const known = tops.get(root);
  if (known !== undefined) {
    return known;
  }
  const directory = path.resolve(root);
  const top = ancestorDirectories(directory).find(hasRepositoryMarker) ?? directory;
  tops.set(root, top);
  return top;
}

function writeListing(directory: string, top: string): string {
  const files = projectFilesUnder(top).filter((file) => CODE.test(file));
  const lines = files.map((file) => `${isTestSourceIn(directory, file) ? '1' : '0'}\t${posix(file)}`);
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-sources-'));
  const target = path.join(folder, 'test-sources.tsv');
  writeFileSync(target, `${[posix(directory), ...lines].join('\n')}\n`, { flag: 'wx' });
  if (written.size === 0) {
    process.once('exit', () => {
      for (const file of written.values()) {
        rmSync(path.dirname(file), { force: true, recursive: true });
      }
    });
  }
  return target;
}

export function testSourcesFact(root: string): Record<string, string> {
  const directory = process.cwd();
  const top = listingTop(root);
  const key = `${directory}\0${top}`;
  const known = written.get(key) ?? writeListing(directory, top);
  written.set(key, known);
  return { 'test-sources': known };
}
