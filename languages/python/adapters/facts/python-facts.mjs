import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProductionModules, pythonSourceFiles } from '../analysis/python-sources.mjs';
import { readPackageFacts } from '../configuration/python-package.mjs';
import { isTestPath, TEST_DIRECTORIES } from '../execution/python-project.mjs';
import { factsBundle } from './facts-bundle.mjs';

export const FACTS_REPORT = 'facts.json';
const FACTS_FAILED_RULE = 'facts-failed';
const FACTS_REQUEST = 'facts-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('../', import.meta.url)), 'import-scan.py');
function factsFiles(projectRoot, sourceRoots) {
  const modules = listProductionModules(projectRoot, sourceRoots);
  const roots = [...sourceRoots, ...TEST_DIRECTORIES, '.'];
  const tests = pythonSourceFiles(projectRoot, roots).filter(isTestPath);
  return {
    modules,
    files: [...new Set([...modules.map(({ file }) => file), ...tests])].sort(),
  };
}

export function collectFacts(context, run) {
  const { projectRoot, reportRoot } = context;
  const { modules, files } = factsFiles(projectRoot, context.project.sourceRoots);
  const request = path.join(reportRoot, FACTS_REQUEST);
  writeFileSync(request, JSON.stringify({ root: projectRoot, files, facts: true }));
  const scanned =
    files.length === 0
      ? {}
      : JSON.parse(
          run(context, ['python', '-I', SCAN_SCRIPT, request], { rule: FACTS_FAILED_RULE }).stdout,
        );
  const report = factsBundle({
    modules,
    scanned,
    isTest: isTestPath,
    ...readPackageFacts(projectRoot),
  });
  writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(report));
  return report;
}
