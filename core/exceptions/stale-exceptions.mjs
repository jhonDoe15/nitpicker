import { runGit } from '../diff/git/repository/command.mjs';
import { renderRuleFilterSection } from '../diff/reporting/text.mjs';
import { exceptionsMatchingNoPath } from '../../shared/exceptions/finding-exceptions.mjs';
import { canonicalRule } from '../../shared/exceptions/rule-names.mjs';
import { RULE_IDS } from '../../shared/policy.mjs';

const PACKAGE_PRESETS = ['java', 'kotlin'];

function labeled(entries = [], name) {
  return entries.map((entry, index) => ({ entry, label: `${name}[${index}]` }));
}

function listedExceptions(config) {
  return [
    ...labeled(config.exceptions, 'exceptions'),
    ...labeled(config.python?.exceptions, 'python.exceptions'),
  ];
}

function gitFiles(projectRoot, options) {
  return runGit(projectRoot, ['ls-files', '-z', ...options])
    .split('\0')
    .filter((file) => file !== '');
}

function headFiles(projectRoot) {
  const deleted = new Set(gitFiles(projectRoot, ['--deleted']));
  return gitFiles(projectRoot, ['--cached', '--others', '--exclude-standard']).filter(
    (file) => !deleted.has(file),
  );
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
