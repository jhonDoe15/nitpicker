import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createToolContext } from '../python-tools.mjs';
import { installFakeToolchain } from './fake-toolchain.mjs';

export function createFakeProjects() {
  const roots = [];

  function temporaryRoot() {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-python-fake-')));
    roots.push(root);
    return root;
  }

  function project(files = {}, { tools } = {}) {
    const root = temporaryRoot();
    installFakeToolchain(path.join(root, '.venv/bin'), tools);
    mkdirSync(path.join(root, 'src/demo'), { recursive: true });
    for (const [relative, contents] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
      writeFileSync(path.join(root, relative), contents);
    }
    return root;
  }

  function contextFor(root, settings = {}) {
    const reportRoot = temporaryRoot();
    return {
      context: createToolContext({ projectRoot: root, liveRoot: root, settings, reportRoot }),
      reportRoot,
    };
  }

  function calls(logFile) {
    return readFileSync(logFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { temporaryRoot, project, contextFor, calls, cleanup };
}
