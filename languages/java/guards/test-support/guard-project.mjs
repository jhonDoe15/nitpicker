import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';

const roots = [];

export function removeGuardProjects() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function guardProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-guard-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

export function newLines(base, head, renames = new Map()) {
  return compareFindings({
    baseFindings: base,
    headFindings: head,
    baseToHeadRenames: renames,
  }).newFindings.map((finding) => [finding.path, finding.location.line]);
}

export function javaClass(header, members) {
  return ['package demo;', header, ...members.map((member) => `  ${member}`), '}', ''].join('\n');
}
