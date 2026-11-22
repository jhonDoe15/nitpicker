import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ancestorDirectories } from '../../filesystem.mts';
import { attempt } from '../../values/attempt/attempt.mts';
import { fieldOf, optionalText, parseJson, textsOf } from '../../values/readers.mts';
import { cachedTree } from '../listing-cache.mts';
import type { Repository } from '../project-files-types.mts';
import { listFolder, loadTree } from '../repository-listing.mts';
import { hasRepositoryMarker } from '../tree-walk.mts';

export const PROJECT_FILES_SNAPSHOT_VARIABLE = 'NITPICKER_PROJECT_FILES_SNAPSHOT';

type SnapshotCache = {
  readonly path: string;
  readonly repository: Repository | undefined;
};

let cachedSnapshot: SnapshotCache | undefined;

function parseSnapshot(raw: unknown): Repository | undefined {
  const top = optionalText(fieldOf(raw, 'top'));
  if (top === undefined) {
    return undefined;
  }
  return {
    top,
    tree: {
      files: textsOf(fieldOf(raw, 'files')),
      links: new Set(textsOf(fieldOf(raw, 'links'))),
      submodules: new Set(textsOf(fieldOf(raw, 'submodules'))),
      gitPaths: textsOf(fieldOf(raw, 'gitPaths')),
    },
  };
}

function readSnapshot(snapshotPath: string): Repository | undefined {
  const parsed = attempt(() => parseJson(readFileSync(snapshotPath, 'utf8')));
  return parsed.ok ? parseSnapshot(parsed.value) : undefined;
}

function serializeRepository({ top, tree }: Repository): string {
  return JSON.stringify({
    top,
    files: tree.files,
    links: [...tree.links],
    submodules: [...tree.submodules],
    gitPaths: tree.gitPaths,
  });
}

export function repositoryOf(directory: string): Repository | undefined {
  const top = ancestorDirectories(directory).find(hasRepositoryMarker);
  if (top === undefined) {
    return undefined;
  }
  const snapshot = snapshotRepository(top);
  if (snapshot !== undefined) {
    return snapshot;
  }
  const tree = cachedTree(top, { load: loadTree, relist: listFolder });
  return tree === undefined ? undefined : { top, tree };
}

export function snapshotRepository(top: string): Repository | undefined {
  const snapshotPath = process.env[PROJECT_FILES_SNAPSHOT_VARIABLE];
  if (snapshotPath === undefined || snapshotPath.length === 0) {
    return undefined;
  }
  if (cachedSnapshot?.path !== snapshotPath) {
    cachedSnapshot = { path: snapshotPath, repository: readSnapshot(snapshotPath) };
  }
  return cachedSnapshot.repository?.top === top ? cachedSnapshot.repository : undefined;
}

export async function withProjectFilesSnapshot<Result>(
  directory: string,
  run: (environment: Readonly<Record<string, string>>) => Promise<Result>,
): Promise<Result> {
  const repository = repositoryOf(path.resolve(directory));
  if (repository === undefined) {
    return run({});
  }
  const tempDirectory = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-files-'));
  const snapshotFile = path.join(tempDirectory, 'snapshot.json');
  try {
    writeFileSync(snapshotFile, serializeRepository(repository));
    return await run({ [PROJECT_FILES_SNAPSHOT_VARIABLE]: snapshotFile });
  } finally {
    attempt(() => {
      rmSync(tempDirectory, { recursive: true, force: true });
    });
  }
}
