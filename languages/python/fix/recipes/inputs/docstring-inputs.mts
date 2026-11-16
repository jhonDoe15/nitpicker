import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProductionModules } from '../../../adapters/analysis/python-sources.mts';
import type { ToolContext } from '../../../adapters/typed/context/tool-context-types.mts';
import type { DocComment, NamedFile } from '../../typed/fix-types.mts';
import { run } from '../../../adapters/execution/python-process.mts';

const SCAN_SCRIPT = path.join(
  fileURLToPath(new URL('../../../adapters/', import.meta.url)),
  'import-scan.py',
);
const parseScan: (text: string) => Record<string, { docComments?: DocComment[] } | undefined> =
  JSON.parse;
const SCAN_REQUEST = 'docstring-scan-request.json';
const PYTHON_SOURCE = /\.py$/u;

export function docstringInputs(
  context: ToolContext,
  files: readonly NamedFile[],
): Record<string, DocComment[]> {
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
  const scanned = parseScan(
    run(context, ['python', '-I', SCAN_SCRIPT, request], { rule: 'docstrings-failed' }).stdout,
  );
  return Object.fromEntries(targets.map((name) => [name, scanned[name]?.docComments ?? []]));
}
