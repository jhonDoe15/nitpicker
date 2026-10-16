import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typeFindings } from '../../python-reports.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { TYPES_REPORT, typeCheck } from '../../python-types.mjs';

const roots = [];

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-type-tools-')));
  roots.push(root);
  return root;
}

export function removeTemporaryRoots() {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}

export function realTypeFindings({ files, checker, toolPrecedence, settings = {} }) {
  const projectRoot = temporaryRoot();
  const reportRoot = temporaryRoot();
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), content);
  }
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['src'], typeChecker: checker, ...settings },
    reportRoot,
    toolPrecedence,
    policyRoot: projectRoot,
  });
  typeCheck(context);
  const report = JSON.parse(readFileSync(path.join(reportRoot, TYPES_REPORT), 'utf8'));
  return typeFindings(report, [projectRoot]).map(
    ({ rule, path: file }) => `${rule} ${path.basename(file)}`,
  );
}
