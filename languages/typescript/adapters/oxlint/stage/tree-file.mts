import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { trackTemporaryPath, untrackTemporaryPath } from '../../typed/tooling.mts';

export async function withTreeFile<Result>(
  run: (treeFile: string) => Promise<Result>,
): Promise<Result> {
  const treeRoot = await mkdtemp(path.join(tmpdir(), 'nitpicker-oxlint-tree-'));
  trackTemporaryPath(treeRoot);
  try {
    return await run(path.join(treeRoot, 'tree.json'));
  } finally {
    await rm(treeRoot, { recursive: true, force: true });
    untrackTemporaryPath(treeRoot);
  }
}
