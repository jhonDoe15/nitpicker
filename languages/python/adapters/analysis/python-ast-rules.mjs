import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReportPath } from '../../../../shared/ingest/common.mjs';
import { run } from '../execution/python-process.mjs';
import { ruffConfigFor } from '../configuration/python-ruff-config.mjs';
import { fileURLToPath } from 'node:url';
import { collectionOptions, isTestFile } from '../configuration/pytest/collection-options.mjs';
import { readPytestConfig } from '../configuration/pytest/pytest-config.mjs';
import { entryFilesOf, readEntryModules } from '../../rules/libraries/entry-modules.mjs';

export const RULES_REPORT = 'rules.json';
const RULES_FAILED_RULE = 'rules-failed';
const FILE_LIST = 'python-files.txt';
const OPTIONS_FILE = 'rule-options.json';
const RULES_SCRIPT = path.resolve(
  fileURLToPath(new URL('../', import.meta.url)),
  '../rules/nitpicker_rules.py',
);

export function readTestFiles(reportRoot) {
  const file = path.join(reportRoot, OPTIONS_FILE);
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).testFiles ?? []) : [];
}

export function pythonSources(context) {
  const { stdout } = run(
    context,
    ['ruff', 'check', '--show-files', '--config', ruffConfigFor(context), '--no-cache', '.'],
    { rule: RULES_FAILED_RULE },
  );
  return stdout
    .split(/\r?\n/)
    .filter((line) => line.endsWith('.py'))
    .map((line) => normalizeReportPath(line, context.projectRoot))
    .filter((file) => file !== undefined);
}

export function checkRules(context) {
  const list = path.join(context.reportRoot, FILE_LIST);
  const options = path.join(context.reportRoot, OPTIONS_FILE);
  const sources = pythonSources(context);
  const collection = collectionOptions(readPytestConfig(context.projectRoot));
  const { testRunner } = context.project;
  writeFileSync(list, sources.join('\n'));
  writeFileSync(
    options,
    JSON.stringify({
      sourceRoots: context.project.sourceRoots,
      testRunner,
      ...collection,
      testFiles: sources.filter((file) => isTestFile(file, collection)),
      entryFiles: entryFilesOf(sources, context.project.entryPoints),
      entryModules: readEntryModules(context.projectRoot),
    }),
  );
  run(
    context,
    ['python', '-I', RULES_SCRIPT, list, path.join(context.reportRoot, RULES_REPORT), options],
    { rule: RULES_FAILED_RULE },
  );
}
