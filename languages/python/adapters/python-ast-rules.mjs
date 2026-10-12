import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { normalizeReportPath } from '../../java/ingest/common.mjs';
import { run } from './python-process.mjs';
import { RUFF_CONFIG } from './python-ruff-config.mjs';

export const RULES_REPORT = 'rules.json';
const RULES_FAILED_RULE = 'rules-failed';
const FILE_LIST = 'python-files.txt';
const RULES_SCRIPT = path.resolve(import.meta.dirname, '../rules/nitpicker_rules.py');

export function pythonSources(context) {
  const { stdout } = run(
    context,
    ['ruff', 'check', '--show-files', '--config', RUFF_CONFIG, '--no-cache', '.'],
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
  writeFileSync(list, pythonSources(context).join('\n'));
  run(context, ['python', '-I', RULES_SCRIPT, list, path.join(context.reportRoot, RULES_REPORT)], {
    rule: RULES_FAILED_RULE,
  });
}
