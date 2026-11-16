import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';
import { compare, type GuardFinding } from './guard-compare.mts';

function writeProjectFile(root: string, name: string, text: string): void {
  const target = path.resolve(root, name);
  if (!target.startsWith(root + path.sep)) {
    throw new Error(`${name} is outside the project ${root}`);
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, text);
}

export function createGuardProjects(): {
  readonly project: (files: Readonly<Record<string, string>>) => string;
  readonly remove: () => void;
} {
  const roots: string[] = [];
  return {
    project(files: Readonly<Record<string, string>>) {
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

export function newLines(
  base: readonly GuardFinding[],
  head: readonly GuardFinding[],
  renames: Map<string, string> = new Map(),
): unknown[][] {
  const compared = compare({
    baseFindings: base,
    headFindings: head,
    baseToHeadRenames: renames,
    touchedCode: undefined,
    unknownOnBase: undefined,
  });
  return listOf(compared['newFindings']).map((finding) => [
    fieldOf(finding, 'path'),
    fieldOf(fieldOf(finding, 'location'), 'line'),
  ]);
}

export function javaClass(header: string, members: readonly string[]): string {
  return ['package demo;', header, ...members.map((member) => `  ${member}`), '}', ''].join('\n');
}
