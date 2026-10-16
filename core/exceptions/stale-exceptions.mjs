import { existsSync } from 'node:fs';
import path from 'node:path';
import { runGit } from '../diff/git/repository/command.mjs';
import { renderRuleFilterSection } from '../diff/reporting/text.mjs';
import { exceptionsMatchingNoPath } from '../../shared/exceptions/finding-exceptions.mjs';
import { canonicalRule } from '../../shared/exceptions/rule-names.mjs';
import { RULE_IDS } from '../../shared/policy.mjs';

const PACKAGE_PRESETS = ['java', 'kotlin'];

function listedExceptions(config) {
  return (config.exceptions ?? []).map((entry, index) => ({
    entry,
    label: `exceptions[${index}]`,
  }));
}

function headFiles(projectRoot) {
  return runGit(projectRoot, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])
    .split('\0')
    .filter((file) => file !== '' && existsSync(path.join(projectRoot, file)));
}

export function staleExceptionLines(config, projectRoot) {
  const listed = listedExceptions(config).filter(
    ({ entry }) =>
      !(
        PACKAGE_PRESETS.includes(config.preset) &&
        canonicalRule(entry.rule) === RULE_IDS.stabilityDirection
      ),
  );
  if (listed.length === 0) {
    return [];
  }
  const stale = new Set(
    exceptionsMatchingNoPath(
      listed.map(({ entry }) => entry),
      headFiles(projectRoot),
    ),
  );
  return listed
    .filter(({ entry }) => stale.has(entry))
    .map(
      ({ entry, label }) => `${label} (${entry.rule}) matches no file: ${entry.paths.join(', ')}`,
    );
}

export function renderClosingSections({ options, config, currentProjectRoot }, report) {
  const lines = staleExceptionLines(config, currentProjectRoot);
  const note =
    lines.length === 0
      ? ''
      : `Note: ${String(lines.length)} ${lines.length === 1 ? 'exception' : 'exceptions'} matching no file (not failing; remove or fix ${lines.length === 1 ? 'it' : 'them'}):\n${lines.map((line) => `  ${line}`).join('\n')}\n`;
  return `${renderRuleFilterSection(report, options.ruleFilters)}${note}`;
}
