import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareFindings } from '../../../../core/diff/comparison/compare.mjs';

function writeProjectFile(root, name, text) {
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside the project ${root}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

export function createGuardProjects() {
  const roots = [];
  return {
    project(files) {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-guard-'));
      roots.push(root);
      for (const [name, text] of Object.entries(files)) {
        writeProjectFile(root, name, text);
      }
      return root;
    },
    remove() {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
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
