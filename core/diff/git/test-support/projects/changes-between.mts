import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type FileMap, writeFiles } from '../fixture-files.mts';
import { commit, copyGitTemplate, createGitTemplate, fixtureGit } from '../git-repository.mts';
import { fieldOf } from '../../../../../shared/values/readers.mts';
import { type ChangedFile, readChangedLines } from './changed-lines-views.mts';
export type SideTexts = Readonly<Record<string, readonly string[]>>;

export function lines(...text: readonly string[]): string {
  return `${text.join('\n')}\n`;
}

export function pick(file: unknown, names: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(names.map((name) => [name, fieldOf(file, name)]));
}

function sideOf(files: SideTexts, side: 0 | 1): FileMap {
  return Object.fromEntries(
    Object.entries(files).map(([file, texts]) => [file, texts[side] ?? '']),
  );
}

function changesIn(root: string, files: SideTexts) {
  writeFiles(root, sideOf(files, 0));
  commit(root, 'base');
  const mergeBaseSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  writeFiles(root, sideOf(files, 1));
  commit(root, 'head');
  const headSha = fixtureGit(root, ['rev-parse', 'HEAD']).trim();
  return readChangedLines({
    repositoryRoot: root,
    mergeBaseSha,
    headSha,
    projectRelativePath: '.',
  });
}

export function changeRepositories(): {
  readonly changesBetween: (files: SideTexts) => Map<string, ChangedFile>;
  readonly remove: () => void;
} {
  const gitTemplate = createGitTemplate();
  const roots: string[] = [];
  return {
    changesBetween(files: SideTexts) {
      const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-unchanged-lines-'));
      roots.push(root);
      copyGitTemplate(gitTemplate, root);
      return changesIn(root, files);
    },
    remove() {
      for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
      }
    },
  };
}
