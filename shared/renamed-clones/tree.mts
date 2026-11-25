import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type TypeScript from 'typescript';
import {
  hasGeneratorHeader,
  hasGeneratorMarker,
} from '../conventions/generated/generator-marker.mts';
import { pathInside } from '../filesystem.mts';
import { readProjectFile } from './files.mts';
import { normalizeSource } from './normalize/normalize.mts';

type TemporaryPaths = {
  readonly track: (filePath: string) => string;
  readonly untrack: (filePath: string) => void;
};

type NormalizedTree = {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly syntaxOf: (file: string) => string;
  readonly typescript?: typeof TypeScript | undefined;
  readonly scratchRoot: string;
  readonly temporaryPaths: TemporaryPaths;
};

export const RENAMED_SETTINGS = { minTokens: 100, minLines: 5, threshold: 100 };

function isGenerated(text: string): boolean {
  return hasGeneratorMarker(text) || hasGeneratorHeader(text);
}

function writeNormalizedTree({
  projectRoot,
  files,
  syntaxOf,
  directory,
  typescript,
}: Pick<NormalizedTree, 'projectRoot' | 'files' | 'syntaxOf' | 'typescript'> & {
  readonly directory: string;
}): void {
  for (const file of files) {
    const text = readProjectFile(projectRoot, file);
    const target = pathInside(directory, file);
    if (text === undefined || target === undefined || isGenerated(text)) {
      continue;
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(
      target,
      normalizeSource({ text, fileName: file, syntax: syntaxOf(file), typescript }),
    );
  }
}

export function withNormalizedTree<Result>(
  { projectRoot, files, syntaxOf, typescript, scratchRoot, temporaryPaths }: NormalizedTree,
  run: (scratch: { readonly tree: string; readonly scratch: string }) => Result,
): Result {
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(path.resolve(scratchRoot, 'renamed-'));
  temporaryPaths.track(scratch);
  const tree = path.resolve(scratch, 'tree');
  try {
    mkdirSync(tree);
    writeNormalizedTree({ projectRoot, files, syntaxOf, directory: tree, typescript });
    return run({ tree, scratch });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    temporaryPaths.untrack(scratch);
  }
}
