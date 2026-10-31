import { projectFilePaths } from '../../shared/project-files/project-files.mjs';
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

function headFiles(projectRoot) {
  return projectFilePaths(projectRoot, { includeLinks: true });
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

function staleNote(lines) {
  if (lines.length === 0) {
    return '';
  }
  const count = lines.length;
  const noun = count === 1 ? 'exception' : 'exceptions';
  const pronoun = count === 1 ? 'it' : 'them';
  const listed = lines.map((line) => `  ${line}`).join('\n');
  return `Note: ${String(count)} ${noun} matching no file (not failing; remove or fix ${pronoun}):\n${listed}\n`;
}

export function renderClosingSections({ options, config, currentProjectRoot }, report) {
  const note = staleNote(staleExceptionLines(config, currentProjectRoot));
  return `${renderRuleFilterSection(report, options.ruleFilters)}${note}`;
}
