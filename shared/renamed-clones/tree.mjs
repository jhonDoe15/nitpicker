import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { hasGeneratorHeader, hasGeneratorMarker } from '../conventions/generator-marker.mjs';
import { pathInside } from '../filesystem.mjs';
import { readProjectFile } from './files.mjs';
import { normalizeSource } from './normalize/normalize.mjs';

export const RENAMED_SETTINGS = { minTokens: 100, minLines: 5, threshold: 100 };

function isGenerated(text) {
  return hasGeneratorMarker(text) || hasGeneratorHeader(text);
}

function writeNormalizedTree({ projectRoot, files, syntaxOf, directory, typescript }) {
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

export function withNormalizedTree(
  { projectRoot, files, syntaxOf, typescript, scratchRoot, temporaryPaths },
  run,
) {
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
