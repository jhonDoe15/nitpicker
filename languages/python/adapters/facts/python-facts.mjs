import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listProductionModules, pythonSourceFiles } from '../analysis/python-sources.mjs';

export const FACTS_REPORT = 'facts.json';
const FACTS_FAILED_RULE = 'facts-failed';
const FACTS_REQUEST = 'facts-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('../', import.meta.url)), 'import-scan.py');
const TEST_DIRECTORIES = ['tests', 'test'];
const TEST_FILE = /^(?:test_.+|.+_test|conftest)\.py$/;

export function isTestFile(file) {
  const parts = file.split('/');
  return (
    TEST_FILE.test(parts.at(-1)) ||
    parts.slice(0, -1).some((part) => TEST_DIRECTORIES.includes(part))
  );
}

export function factsFiles(projectRoot, sourceRoots) {
  const modules = listProductionModules(projectRoot, sourceRoots);
  const roots = [...sourceRoots, ...TEST_DIRECTORIES, '.'];
  const tests = pythonSourceFiles(projectRoot, roots).filter(isTestFile);
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
  const report = {
    modules,
    files: Object.fromEntries(
      Object.entries(scanned).map(([file, facts]) => [file, { test: isTestFile(file), ...facts }]),
    ),
  };
  writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(report));
  return report;
}
