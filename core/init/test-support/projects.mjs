import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { insideProject } from '../support/inside-project.mjs';

const GIT_TIMEOUT_MS = 30_000;

function writeFiles(root, files) {
  for (const [name, text] of Object.entries(files)) {
    const file = insideProject(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

function initializeRepository(root) {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root, timeout: GIT_TIMEOUT_MS });
}

export function readText(root, name) {
  return readFileSync(insideProject(root, name), 'utf8');
}

export function useProjects() {
  const roots = [];
  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });
  return function project(files, { repository = false } = {}) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-init-')));
    roots.push(root);
    writeFiles(root, files);
    if (repository) {
      initializeRepository(root);
    }
    return root;
  };
}

export function captureOutput() {
  const output = { stdoutText: '', stderrText: '' };
  return {
    output,
    stdout: { write: (text) => (output.stdoutText += text) },
    stderr: { write: (text) => (output.stderrText += text) },
  };
}
