import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { typeFindings } from '../../python-reports.mjs';
import { createToolContext } from '../../python-tools.mjs';
import { TYPES_REPORT, typeCheck } from '../../python-types.mjs';

function temporaryRoot() {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-type-tools-')));
}

function writeProject(projectRoot, files) {
  for (const [file, content] of Object.entries(files)) {
    const full = path.resolve(projectRoot, file);
    if (!full.startsWith(projectRoot + path.sep)) {
      throw new Error(`${file} is outside the project`);
    }
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

function findingsIn(
  { files, checker, toolPrecedence, settings, exclude },
  projectRoot,
  reportRoot,
) {
  writeProject(projectRoot, files);
  const context = createToolContext({
    projectRoot,
    liveRoot: projectRoot,
    settings: { environment: 'path', sourceRoots: ['src'], typeChecker: checker, ...settings },
    reportRoot,
    exclude,
    toolPrecedence,
    policyRoot: projectRoot,
  });
  typeCheck(context);
  const report = JSON.parse(readFileSync(path.join(reportRoot, TYPES_REPORT), 'utf8'));
  return typeFindings(report, [projectRoot]).map(
    ({ rule, path: file }) => `${rule} ${path.basename(file)}`,
  );
}

export function realTypeFindings({ settings = {}, exclude = [], ...options }) {
  const projectRoot = temporaryRoot();
  const reportRoot = temporaryRoot();
  try {
    return findingsIn({ ...options, settings, exclude }, projectRoot, reportRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
    rmSync(reportRoot, { recursive: true, force: true });
  }
}
