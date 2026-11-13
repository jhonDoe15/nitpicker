import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';

const GLOB_CHARACTER = /[*?{[\]()!+@|]/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

type PatternPlan = {
  readonly base: string;
  readonly maxDepth: number;
  readonly matcher: { test(value: string): boolean };
};

function patternPlan(pattern: string): PatternPlan {
  const normalized = pattern.replace(/^\.\//u, '');
  const segments = normalized.split('/');
  const firstGlob = segments.findIndex((segment) => GLOB_CHARACTER.test(segment));
  const baseLength = firstGlob === -1 ? segments.length - 1 : firstGlob;
  const remaining = segments.slice(baseLength);
  return {
    base: segments.slice(0, baseLength).join('/'),
    maxDepth: remaining.includes('**') ? Infinity : remaining.length - 1,
    matcher: globMatcher(normalized),
  };
}

async function isDirectory(projectRoot: string, base: string): Promise<boolean> {
  const segments = base.length === 0 ? [] : base.split('/');
  for (const [index, segment] of segments.entries()) {
    if (SKIPPED_DIRECTORIES.has(segment)) return false;
    const directory = path.join(projectRoot, ...segments.slice(0, index + 1));
    const entry = await lstat(directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return undefined;
      throw error;
    });
    if (entry?.isDirectory() !== true) return false;
  }
  return true;
}

async function filesForPattern(projectRoot: string, plan: PatternPlan): Promise<string[]> {
  if (!(await isDirectory(projectRoot, plan.base))) return [];
  const files: string[] = [];
  const pending = [{ relative: plan.base, depth: 0 }];
  for (const { relative, depth } of pending) {
    const entries = await readdir(path.join(projectRoot, relative), { withFileTypes: true });
    for (const entry of entries) {
      const file = path.posix.join(relative, entry.name);
      if (entry.isFile() && plan.matcher.test(file)) files.push(file);
      if (entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name) && depth < plan.maxDepth) {
        pending.push({ relative: file, depth: depth + 1 });
      }
    }
  }
  return files;
}

export async function matchingFiles(
  projectRoot: string,
  patterns: readonly string[],
): Promise<string[]> {
  const matches = await Promise.all(
    patterns.map((pattern) => filesForPattern(projectRoot, patternPlan(pattern))),
  );
  return [...new Set(matches.flat())].toSorted();
}
