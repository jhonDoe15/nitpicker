import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeFiles } from './fixture-files.mjs';
import { commit, copyGitTemplate, createGitTemplate, fixtureGit } from './git-repository.mjs';
import { readChangedLines } from '../patches/changed-lines.mjs';

export function lines(...text) {
  return `${text.join('\n')}\n`;
}

export function pick(file, names) {
  return Object.fromEntries(names.map((name) => [name, file[name]]));
}

function sideOf(files, side) {
  return Object.fromEntries(Object.entries(files).map(([file, texts]) => [file, texts[side]]));
}

function changesIn(root, files) {
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

export function changeRepositories() {
  const gitTemplate = createGitTemplate();
  const roots = [];
  return {
    changesBetween(files) {
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
