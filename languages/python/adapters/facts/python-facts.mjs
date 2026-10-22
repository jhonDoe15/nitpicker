import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  listProductionModules,
  pythonSourceFiles,
  testFileMatcher,
} from '../analysis/python-sources.mjs';
import { readPackageFacts } from '../../rules/libraries/package-facts.mjs';
import { ROOT_TEST_DIRECTORIES } from '../execution/python-project.mjs';
import { factsBundle } from './facts-bundle.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { registeredFactRules } from '../../../../shared/project-rules/fact-rules.mjs';
import { RULE_IDS } from '../../../../shared/policy.mjs';

export const FACTS_REPORT = 'facts.json';
export const BASE_FACTS_REPORT = 'base-facts.json';
export const FACTS_TOOL = 'facts';
const FACTS_FAILED_RULE = 'facts-failed';
const FACTS_REQUEST = 'facts-request.json';
const SCAN_SCRIPT = path.join(fileURLToPath(new URL('../', import.meta.url)), 'import-scan.py');
function factsFiles(projectRoot, sourceRoots, isTest) {
  const modules = listProductionModules(projectRoot, sourceRoots);
  const roots = [...sourceRoots, ...ROOT_TEST_DIRECTORIES, '.'];
  const tests = pythonSourceFiles(projectRoot, roots).filter(isTest);
  return {
    modules,
    files: [...new Set([...modules.map(({ file }) => file), ...tests])].sort(),
  };
}

function scanFacts(context, run, root) {
  const isTest = testFileMatcher(root);
  const { modules, files } = factsFiles(root, context.project.sourceRoots, isTest);
  const request = path.join(context.reportRoot, FACTS_REQUEST);
  writeFileSync(request, JSON.stringify({ root, files, facts: true }));
  const scanned =
    files.length === 0
      ? {}
      : JSON.parse(
          run(context, ['python', '-I', SCAN_SCRIPT, request], { rule: FACTS_FAILED_RULE }).stdout,
        );
  return factsBundle({ modules, scanned, isTest, ...readPackageFacts(root) });
}

export function collectFacts(context, run) {
  const { projectRoot, reportRoot, snapshot, baselineRoot } = context;
  const report = scanFacts(context, run, projectRoot);
  writeFileSync(path.join(reportRoot, FACTS_REPORT), JSON.stringify(report));
  if (snapshot === 'head' && baselineRoot !== undefined) {
    const base = scanFacts(context, run, baselineRoot);
    writeFileSync(path.join(reportRoot, BASE_FACTS_REPORT), JSON.stringify(base));
  }
  return report;
}

function readReport(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
}

export function readFactFindings(reportRoot, { exceptions = [], baselineMovesFile } = {}) {
  const facts = readReport(path.join(reportRoot, FACTS_REPORT));
  if (facts === undefined) {
    return [];
  }
  const baseFacts = readReport(path.join(reportRoot, BASE_FACTS_REPORT));
  const rules = registeredFactRules('python').filter((rule) => rule !== RULE_IDS.testConsoleOutput);
  return sharedFactFindings(facts, {
    language: 'python',
    analyzerName: FACTS_TOOL,
    rules,
    policy: { exceptions },
    ...(baseFacts === undefined
      ? {}
      : { baseline: { facts: baseFacts, movesFile: baselineMovesFile } }),
  });
}
