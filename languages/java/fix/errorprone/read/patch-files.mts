import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, listOf, textOf } from '../../../../../shared/values/readers.mts';
import { type Hunk, parseUnifiedDiff } from '../patch/unified-diff.mts';
import type { Diagnostic } from './label-hunks.mts';
import { appendAll } from '../../../../../shared/lists/lists.mts';

type Entry<T> = readonly [string, T];

const PATCH_NAME = 'error-prone.patch';
const REPORT_NAME = 'errorprone.json';
const CHECK = /^\[(\w+)\]/u;

function filesNamed(directory: string, name: string): string[] {
  const pending = [directory];
  const found: string[] = [];
  for (const current of pending) {
    const entries = existsSync(current) ? readdirSync(current, { withFileTypes: true }) : [];
    appendAll(
      pending,
      entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(current, entry.name)),
    );
    appendAll(
      found,
      entries.filter((entry) => entry.name === name).map((entry) => path.join(current, entry.name)),
    );
  }
  return found;
}

function relativeTo(root: string, absolute: string): string | undefined {
  const relative = path.relative(root, absolute);
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep).join('/');
}

function projectPath(
  projectRoot: string,
  patchFile: string,
  name: string | undefined,
): string | undefined {
  if (name === undefined) {
    return undefined;
  }
  const absolute = path.isAbsolute(name)
    ? name
    : path.resolve(realpathSync(path.dirname(patchFile)), name);
  return relativeTo(projectRoot, absolute) ?? relativeTo(realpathSync(projectRoot), absolute);
}

function patchEntries(patchFile: string, projectRoot: string): Entry<readonly Hunk[]>[] {
  return parseUnifiedDiff(readFileSync(patchFile, 'utf8')).flatMap(
    ({ oldPath, newPath, hunks }): Entry<readonly Hunk[]>[] => {
      const name = oldPath === undefined ? undefined : projectPath(projectRoot, patchFile, newPath);
      return name === undefined ? [] : [[name, hunks]];
    },
  );
}

function reportEntries(reportFile: string, projectRoot: string): Entry<Diagnostic[]>[] {
  const report: unknown = JSON.parse(readFileSync(reportFile, 'utf8'));
  if (!Array.isArray(report)) {
    throw new TypeError(`${reportFile} does not hold a list of Error Prone diagnostics`);
  }
  return listOf(report).flatMap((entry): Entry<Diagnostic[]>[] => {
    const file = fieldOf(entry, 'file');
    const name = projectPath(
      projectRoot,
      reportFile,
      file === undefined ? undefined : textOf(file),
    );
    const check = CHECK.exec(textOf(fieldOf(entry, 'message') ?? ''))?.[1];
    const line = fieldOf(entry, 'line');
    return name === undefined || check === undefined || typeof line !== 'number'
      ? []
      : [[name, [{ check, line }]]];
  });
}

function grouped<T>(entries: readonly Entry<readonly T[]>[]): Map<string, T[]> {
  const byName = Map.groupBy(entries, ([name]) => name);
  return new Map([...byName].map(([name, group]) => [name, group.flatMap(([, items]) => items)]));
}

export function readPatches({
  patchRoot,
  projectRoot,
}: {
  readonly patchRoot: string;
  readonly projectRoot: string;
}): Map<string, Hunk[]> {
  return grouped<Hunk>(
    filesNamed(patchRoot, PATCH_NAME).flatMap((file) => patchEntries(file, projectRoot)),
  );
}

export function readDiagnostics({
  reportRoot,
  projectRoot,
}: {
  readonly reportRoot: string;
  readonly projectRoot: string;
}): Map<string, Diagnostic[]> {
  return grouped<Diagnostic>(
    filesNamed(reportRoot, REPORT_NAME).flatMap((file) => reportEntries(file, projectRoot)),
  );
}
