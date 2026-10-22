import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ruffFindings } from '../../python-reports.mjs';
import { createToolContext, lint, RUFF_REPORT } from '../../python-tools.mjs';

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-lint-')));
  mkdirSync(path.join(root, '.git'));
  return root;
}

function writeProject(root, files) {
  for (const [file, content] of Object.entries(files)) {
    const full = path.resolve(root, file);
    if (!full.startsWith(root + path.sep)) {
      throw new Error(`${file} is outside the project`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function findingsIn({ files, policyFiles, toolPrecedence, exclude = [] }, roots) {
  writeProject(roots.projectRoot, files);
  writeProject(roots.policyRoot, policyFiles ?? {});
  const context = createToolContext({
    projectRoot: roots.projectRoot,
    liveRoot: roots.projectRoot,
    settings: { environment: 'path', sourceRoots: ['src'] },
    reportRoot: roots.reportRoot,
    exclude,
    toolPrecedence,
    policyRoot: roots.policyRoot,
  });
  lint(context);
  const log = JSON.parse(readFileSync(path.join(roots.reportRoot, RUFF_REPORT), 'utf8'));
  return ruffFindings(log, { roots: [roots.projectRoot], projectRoot: roots.projectRoot })
    .map(({ rule, path: file }) => `${rule} ${file}`)
    .toSorted();
}

export function realLintFindings(options) {
  const projectRoot = temporaryRoot();
  const roots = {
    projectRoot,
    policyRoot: options.policyFiles === undefined ? projectRoot : temporaryRoot(),
    reportRoot: temporaryRoot(),
  };
  try {
    return findingsIn(options, roots);
  } finally {
    for (const root of new Set(Object.values(roots))) {
      rmSync(root, { recursive: true, force: true });
    }
  }
}
