import { closeSync, mkdtempSync, openSync, rmSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ancestorDirectories } from '../../../../../shared/filesystem.mts';
import { hasRepositoryMarker } from '../../../../../shared/project-files/tree-walk.mts';
import { projectFilesUnder } from '../../../../../shared/project-files/project-files.mts';
import { memoized } from '../../../../../shared/values/caching/memoized.mts';
import { isTestSourceIn } from '../rules/support/io/implementations.mts';

const CODE = /\.[cm]?[jt]sx?$/u;

function posix(file: string): string {
  return file.replaceAll('\\', '/');
}

const listingTop = memoized((root: string): string => {
  const directory = path.resolve(root);
  return ancestorDirectories(directory).find(hasRepositoryMarker) ?? directory;
});

const listingFolders = memoized((_process: NodeJS.Process): string[] => {
  const folders: string[] = [];
  process.once('exit', () => {
    for (const folder of folders) {
      rmSync(folder, { force: true, recursive: true });
    }
  });
  return folders;
});

function writeListing(directory: string, top: string): string {
  const folder = mkdtempSync(path.join(tmpdir(), 'nitpicker-test-sources-'));
  listingFolders(process).push(folder);
  const target = path.join(folder, 'test-sources.tsv');
  const descriptor = openSync(target, 'wx');
  try {
    writeSync(descriptor, `${posix(directory)}\n`);
    for (const file of projectFilesUnder(top).filter((each) => CODE.test(each))) {
      writeSync(descriptor, `${isTestSourceIn(directory, file) ? '1' : '0'}\t${posix(file)}\n`);
    }
  } finally {
    closeSync(descriptor);
  }
  return target;
}

const listingFor = memoized((key: string): string => {
  const [directory = '', top = ''] = key.split('\0');
  return writeListing(directory, top);
});

export function testSourcesFact(root: string): Record<string, string> {
  return { 'test-sources': listingFor(`${process.cwd()}\0${listingTop(root)}`) };
}
