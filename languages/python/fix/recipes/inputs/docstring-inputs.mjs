import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProductionModules } from '../../../adapters/analysis/python-sources.mjs';
import { run } from '../../../adapters/execution/python-process.mjs';

const SCAN_SCRIPT = path.join(
  fileURLToPath(new URL('../../../adapters/', import.meta.url)),
  'import-scan.py',
);
const SCAN_REQUEST = 'docstring-scan-request.json';
const PYTHON_SOURCE = /\.py$/u;

export function docstringInputs(context, files) {
  const { projectRoot, reportRoot } = context;
  const modules = new Set(
    listProductionModules(projectRoot, context.project.sourceRoots).map(({ file }) => file),
  );
  const targets = files
    .map(({ path: name }) => name)
    .filter((name) => PYTHON_SOURCE.test(name) && modules.has(name));
  if (targets.length === 0) {
    return {};
  }
  const request = path.join(reportRoot, SCAN_REQUEST);
  writeFileSync(request, JSON.stringify({ root: projectRoot, files: targets, facts: true }));
  const scanned = JSON.parse(
    run(context, ['python', '-I', SCAN_SCRIPT, request], { rule: 'docstrings-failed' }).stdout,
  );
  return Object.fromEntries(targets.map((name) => [name, scanned[name]?.docComments ?? []]));
}
