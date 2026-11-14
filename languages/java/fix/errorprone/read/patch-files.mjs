import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { parseUnifiedDiff } from '../patch/unified-diff.mjs';

const PATCH_NAME = 'error-prone.patch';
const REPORT_NAME = 'errorprone.json';
const CHECK = /^\[(\w+)\]/u;

function filesNamed(directory, name) {
  const pending = [directory];
  const found = [];
  for (const current of pending) {
    const entries = existsSync(current) ? readdirSync(current, { withFileTypes: true }) : [];
    pending.push(
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(current, entry.name)),
    );
    found.push(
      ...entries
        .filter((entry) => entry.name === name)
        .map((entry) => path.join(current, entry.name)),
    );
  }
  return found;
}

function relativeTo(root, absolute) {
  const relative = path.relative(root, absolute);
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative)
    ? undefined
    : relative.split(path.sep).join('/');
}

function projectPath(projectRoot, patchFile, name) {
  if (name === undefined) {
    return undefined;
  }
  const absolute = path.isAbsolute(name)
    ? name
    : path.resolve(realpathSync(path.dirname(patchFile)), name);
  return relativeTo(projectRoot, absolute) ?? relativeTo(realpathSync(projectRoot), absolute);
}

function patchEntries(patchFile, projectRoot) {
  return parseUnifiedDiff(readFileSync(patchFile, 'utf8'))
    .filter(({ oldPath, newPath }) => oldPath !== undefined && newPath !== undefined)
    .map(({ newPath, hunks }) => [projectPath(projectRoot, patchFile, newPath), hunks])
    .filter(([name]) => name !== undefined);
}

function reportEntries(reportFile, projectRoot) {
  return JSON.parse(readFileSync(reportFile, 'utf8'))
    .map((entry) => [
      projectPath(projectRoot, reportFile, entry.file),
      { check: CHECK.exec(entry.message ?? '')?.[1], line: entry.line },
    ])
    .filter(([name, { check }]) => name !== undefined && check !== undefined);
}

function grouped(entries) {
  const groups = new Map();
  for (const [name, items] of entries) {
    groups.set(name, [...(groups.get(name) ?? []), ...[items].flat()]);
  }
  return groups;
}

export function readPatches({ patchRoot, projectRoot }) {
  return grouped(
    filesNamed(patchRoot, PATCH_NAME).flatMap((file) => patchEntries(file, projectRoot)),
  );
}

export function readDiagnostics({ reportRoot, projectRoot }) {
  return grouped(
    filesNamed(reportRoot, REPORT_NAME).flatMap((file) => reportEntries(file, projectRoot)),
  );
}
