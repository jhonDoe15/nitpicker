import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RULES_REPORT, checkRules } from '../adapters/python-ast-rules.mjs';
import { createToolContext } from '../adapters/python-tools.mjs';

const roots = [];

export function removeScripts() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function findingsOf(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-script-')));
  const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-report-')));
  roots.push(root, reportRoot);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  const context = createToolContext({
    projectRoot: root,
    liveRoot: root,
    settings: { environment: 'path', sourceRoots: ['.'] },
    reportRoot,
  });
  checkRules(context);
  return JSON.parse(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8')).map(
    ({ rule, path: file, subject, line }) => `${rule} ${file}:${String(line)} ${subject}`,
  );
}

export const single = (code, file = 'src/mod.py') => findingsOf({ [file]: code });
