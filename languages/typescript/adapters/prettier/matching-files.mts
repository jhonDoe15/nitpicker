import { type Dirent, lstatSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { globMatcher } from '../typed/head-policy.mts';

const GLOB_CHARACTER = /[*?{[\]()!+@|]/u;
const SKIPPED_DIRECTORIES = new Set(['node_modules', '.git']);

type PatternPlan = {
  readonly base: string;
  readonly maxDepth: number;
  readonly matcher: { test(value: string): boolean };
};

type DirectoryFrame = { readonly relative: string; readonly depth: number };

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

function isDirectory(projectRoot: string, base: string): boolean {
  const segments = base.length === 0 ? [] : base.split('/');
  for (const [index, segment] of segments.entries()) {
    if (SKIPPED_DIRECTORIES.has(segment)) {
      return false;
    }
    const directory = path.resolve(projectRoot, ...segments.slice(0, index + 1));
    if (!directory.startsWith(projectRoot + path.sep)) {
      return false;
    }
    if (lstatSync(directory, { throwIfNoEntry: false })?.isDirectory() !== true) {
      return false;
    }
  }
  return true;
}

function subdirectories(
  entries: readonly Dirent[],
  { relative, depth }: DirectoryFrame,
  maxDepth: number,
): DirectoryFrame[] {
  if (depth >= maxDepth) {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name))
    .map((entry) => ({ relative: path.posix.join(relative, entry.name), depth: depth + 1 }));
}

async function filesForPattern(projectRoot: string, plan: PatternPlan): Promise<string[]> {
  if (!isDirectory(projectRoot, plan.base)) {
    return [];
  }
  const files: string[] = [];
  const pending = [{ relative: plan.base, depth: 0 }];
  for (const frame of pending) {
    const entries = await readdir(path.join(projectRoot, frame.relative), { withFileTypes: true });
    files.push(
      ...entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.posix.join(frame.relative, entry.name))
        .filter((file) => plan.matcher.test(file)),
    );
    pending.push(...subdirectories(entries, frame, plan.maxDepth));
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
  return [...new Set(matches.flat())].toSorted((left, right) => left.localeCompare(right));
}
