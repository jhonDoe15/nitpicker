import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from '../../test-runs/test-step.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { readConsoleReport } from '../console-output.mjs';

export function createConsoleProjects() {
  const roots = [];

  function directoryWith(prefix, files) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
    roots.push(root);
    for (const [file, content] of Object.entries(files)) {
      const target = path.resolve(root, file);
      if (!target.startsWith(root + path.sep)) {
        throw new Error(`${file} is outside the project`);
      }
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return root;
  }

  function consoleReport(files) {
    const root = directoryWith('nitpicker-pytest-report-', { 'pyproject.toml': '', ...files });
    const reportRoot = directoryWith('nitpicker-pytest-out-', {});
    const context = createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings: { environment: 'path', testRunner: 'pytest', sourceRoots: ['src'] },
      reportRoot,
    });
    const outcome = {};
    test(context, outcome);
    return { root, report: readConsoleReport(reportRoot).report, outcome };
  }

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  return { consoleReport, cleanup };
}
