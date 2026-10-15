import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../diff/git.mjs';
import { spawnSync } from 'node:child_process';

const MAX_FILE_BYTES = 512 * 1024;

export function commitSource({ repositoryRoot, commitSha, projectRelativePath }) {
  const prefix = projectRelativePath === '.' ? '' : `${projectRelativePath.replaceAll('\\', '/')}/`;
  return {
    paths: () =>
      runGit(repositoryRoot, ['ls-tree', '-r', '-z', '--name-only', commitSha, '--', prefix || '.'])
        .split('\0')
        .filter((file) => file.length > 0 && file.startsWith(prefix))
        .map((file) => file.slice(prefix.length)),
    readMany: (files) => readBlobs({ repositoryRoot, commitSha, prefix, files }),
  };
}

export function workingTreeSource(projectRoot) {
  return {
    paths: () =>
      runGit(projectRoot, [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        '.',
      ])
        .split('\0')
        .filter((file) => file.length > 0),
    readMany: (files) =>
      new Map(
        files.flatMap((file) => {
          const text = readSmallFile(path.join(projectRoot, file));
          return text === undefined ? [] : [[file, text]];
        }),
      ),
  };
}

function readSmallFile(file) {
  try {
    return statSync(file).size > MAX_FILE_BYTES ? undefined : readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

function readBlobs({ repositoryRoot, commitSha, prefix, files }) {
  if (files.length === 0) {
    return new Map();
  }
  const result = spawnSync('git', ['cat-file', '--batch'], {
    cwd: repositoryRoot,
    input: files.map((file) => `${commitSha}:${prefix}${file}\n`).join(''),
    maxBuffer: files.length * (MAX_FILE_BYTES + 256),
  });
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`git cat-file --batch failed in ${repositoryRoot}`, { cause: result.error });
  }
  return parseBatch(result.stdout, files);
}

function parseBatch(output, files) {
  const texts = new Map();
  let offset = 0;
  for (const file of files) {
    const headerEnd = output.indexOf(0x0a, offset);
    const header = output.subarray(offset, headerEnd).toString('utf8').split(' ');
    offset = headerEnd + 1;
    if (header[1] === 'missing' || header.length < 3) {
      continue;
    }
    const size = Number(header[2]);
    if (header[1] === 'blob' && size <= MAX_FILE_BYTES) {
      texts.set(file, output.subarray(offset, offset + size).toString('utf8'));
    }
    offset += size + 1;
  }
  return texts;
}
