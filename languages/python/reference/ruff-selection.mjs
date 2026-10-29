import { spawnSync } from 'node:child_process';
import { isStableRule } from '../adapters/configuration/python-ruff-config.mjs';
import { RUFF_IGNORE, RUFF_SELECT } from '../adapters/configuration/python-rule-ids.mjs';
import { paragraphsOf } from '../../../shared/reference/build/text.mjs';

const CODE = /^([A-Z]+)(\d*)$/u;
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;
const SECTION = /^## (.+)$/mu;
const FENCE = /```\w*\n[\s\S]*?```/gu;
const USE_INSTEAD = /Use instead:\s*```python\n([\s\S]*?)```/u;
const REFERENCE_LINK = /\[([^\]]+)\](?!\()/gu;
const VERSION = /^ruff (\S+)/u;
const WHY_PARAGRAPHS = 2;

function isSelected(code) {
  const [, letters, digits] = CODE.exec(code);
  return RUFF_SELECT.some((selector) => {
    const [, selectorLetters, selectorDigits] = CODE.exec(selector);
    return selectorLetters === letters && digits.startsWith(selectorDigits);
  });
}

function sectionsOf(explanation) {
  const parts = explanation.split(SECTION).slice(1);
  return new Map(
    parts.flatMap((part, index) => (index % 2 === 0 ? [[part.trim(), parts[index + 1]]] : [])),
  );
}

function leadingParagraphs(section, count) {
  return section === undefined
    ? undefined
    : paragraphsOf(section.replaceAll(FENCE, '').replaceAll(REFERENCE_LINK, '$1'))
        .slice(0, count)
        .join(' ');
}

function explained({ explanation = '' }) {
  const sections = sectionsOf(explanation);
  const example = USE_INSTEAD.exec(explanation)?.[1].trimEnd();
  return Object.fromEntries(
    [
      ['whatItDoes', leadingParagraphs(sections.get('What it does'), 1)],
      ['why', leadingParagraphs(sections.get('Why is this bad?'), WHY_PARAGRAPHS)],
      ['useInstead', example],
    ].filter(([, value]) => value !== undefined && value !== ''),
  );
}

function selectedRuffRules(rules) {
  return rules
    .filter(
      (rule) => isStableRule(rule) && isSelected(rule.code) && !RUFF_IGNORE.includes(rule.code),
    )
    .map((rule) => ({
      code: rule.code,
      name: rule.name,
      linter: rule.linter,
      summary: rule.summary,
      ...explained(rule),
    }))
    .toSorted((left, right) => left.code.localeCompare(right.code));
}

/** Whether the dotted version `left` comes before `right` (`0.16.8` before `0.16.10`). */
export function isOlderVersion(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const differing = leftParts.findIndex((part, index) => part !== (rightParts[index] ?? 0));
  return differing === -1
    ? leftParts.length < rightParts.length
    : leftParts[differing] < (rightParts[differing] ?? 0);
}

/** The version of the ruff at `ruff`, as `ruff --version` prints it, or undefined when it cannot be run. */
export function ruffVersion(ruff) {
  const result = spawnSync(ruff, ['--version'], { encoding: 'utf8' });
  return result.status === 0 ? VERSION.exec(result.stdout)?.[1] : undefined;
}

/**
 * The rules of the ruff at `ruff` (a path, or a command on the PATH) that the preset selects, with
 * the text of each rule's documentation the reference uses, and that ruff's version; undefined when
 * it cannot be run.
 */
export function installedRuffRules(ruff) {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT,
  });
  const version = ruffVersion(ruff);
  return result.status === 0 && version !== undefined
    ? { version, rules: selectedRuffRules(JSON.parse(result.stdout)) }
    : undefined;
}
