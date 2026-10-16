import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RULES_REPORT, checkRules } from '../../adapters/analysis/python-ast-rules.mjs';
import { createToolContext } from '../../adapters/python-tools.mjs';

function writeFiles(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const target = path.resolve(root, file);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`${file} is outside ${root}`);
    }
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

export function createScripts() {
  const roots = [];

  function cleanup() {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  }

  function reportOf(files) {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-script-')));
    const reportRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-rules-report-')));
    roots.push(root, reportRoot);
    writeFiles(root, files);
    const context = createToolContext({
      projectRoot: root,
      liveRoot: root,
      settings: { environment: 'path', sourceRoots: ['.'] },
      reportRoot,
    });
    checkRules(context);
    return JSON.parse(readFileSync(path.join(reportRoot, RULES_REPORT), 'utf8'));
  }

  function findingsOf(files) {
    return reportOf(files).map(
      ({ rule, path: file, subject, line }) => `${rule} ${file}:${String(line)} ${subject}`,
    );
  }

  function single(code, file = 'src/mod.py') {
    return findingsOf({ [file]: code });
  }

  return { cleanup, findingsOf, reportOf, single };
}
