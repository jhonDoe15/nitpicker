import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git', 'dist', 'coverage', '.stryker-tmp']);

/**
 * A tree is a Map from posix relative path to file text. Detectors compare the fixture tree with
 * the agent's final tree, so they never depend on the gate's own verdict.
 */
export function loadTree(directory, skipped = SKIPPED_DIRECTORIES) {
  const tree = new Map();
  const walk = (relative) => {
    for (const entry of readdirSync(path.join(directory, relative), {
      withFileTypes: true,
    })) {
      const entryPath = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) {
        if (!skipped.has(entry.name)) walk(entryPath);
      } else if (entry.isFile()) {
        tree.set(entryPath, readFileSync(path.join(directory, entryPath), 'utf8'));
      }
    }
  };
  walk('');
  return tree;
}
