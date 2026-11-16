import { spawnSync } from 'node:child_process';
import { isStableRule } from '../adapters/configuration/python-ruff-config.mts';
import { RUFF_IGNORE, RUFF_SELECT } from '../adapters/configuration/python-rule-ids.mts';
import { paragraphsOf as untypedParagraphsOf } from '../../../shared/reference/build/text.mjs';
import { PROBE_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import { parseRuffRules } from './typed/ruff-rule-views.mts';
import type { RuffRule, RuffSnapshot } from './typed/ruff-rule-views.mts';

const paragraphsOf: (text: string) => string[] = untypedParagraphsOf;

const CODE = /^([A-Z]+)(\d*)$/u;
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;
const SECTION = /^## (.+)$/mu;
const SAFETY_SECTION = /^## Fix safety\n([\s\S]*?)(?=\n## |(?![\s\S]))/mu;
const SAFE_WORD = /\bsafe\b/iu;
const UNSAFE_WORD = /unsafe|display-only/iu;
const FENCE = /```\w*\n[\s\S]*?```/gu;
const USE_INSTEAD = /Use instead:\s*```python\n([\s\S]*?)```/u;
const REFERENCE_LINK = /\[([^\]]+)\](?!\()/gu;
const VERSION = /^ruff (\S+)/u;
const WHY_PARAGRAPHS = 2;

function isSelected(code: string): boolean {
  const [, letters = '', digits = ''] = CODE.exec(code) ?? [];
  return RUFF_SELECT.some((selector) => {
    const [, selectorLetters = '', selectorDigits = ''] = CODE.exec(selector) ?? [];
    return selectorLetters === letters && digits.startsWith(selectorDigits);
  });
}

export function isPresetRule(code: string): boolean {
  return isSelected(code) && !RUFF_IGNORE.includes(code);
}

function sectionsOf(explanation: string): Map<string, string | undefined> {
  const parts = explanation.split(SECTION).slice(1);
  return new Map(
    parts.flatMap((part, index): [string, string | undefined][] =>
      index % 2 === 0 ? [[part.trim(), parts[index + 1]]] : [],
    ),
  );
}

function leadingParagraphs(section: string | undefined, count: number): string | undefined {
  return section === undefined
    ? undefined
    : paragraphsOf(section.replaceAll(FENCE, '').replaceAll(REFERENCE_LINK, '$1'))
        .slice(0, count)
        .join(' ');
}

function explained({ explanation = '' }: RuffRule): Partial<RuffRule> {
  const sections = sectionsOf(explanation);
  const example = USE_INSTEAD.exec(explanation)?.[1]?.trimEnd();
  const entries: [string, string | undefined][] = [
    ['whatItDoes', leadingParagraphs(sections.get('What it does'), 1)],
    ['why', leadingParagraphs(sections.get('Why is this bad?'), WHY_PARAGRAPHS)],
    ['useInstead', example],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined && value !== ''));
}

function hasSafeFix({ fix = '', explanation = '' }: RuffRule): boolean {
  if (fix.includes('not available')) {
    return false;
  }
  const safety = SAFETY_SECTION.exec(explanation)?.[1];
  const first = safety === undefined ? '' : (paragraphsOf(safety)[0] ?? '');
  return safety === undefined || (SAFE_WORD.test(first) && !UNSAFE_WORD.test(first));
}

function selectedRuffRules(rules: readonly RuffRule[]): RuffRule[] {
  return rules
    .filter(
      (rule) => (isStableRule(rule) || RUFF_SELECT.includes(rule.code)) && isPresetRule(rule.code),
    )
    .map((rule): RuffRule => ({
      code: rule.code,
      name: rule.name,
      linter: rule.linter,
      summary: rule.summary,
      ...(hasSafeFix(rule) ? { safeFix: true } : {}),
      ...explained(rule),
    }))
    .toSorted((left, right) => left.code.localeCompare(right.code));
}

export function isOlderVersion(left: string, right: string): boolean {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  const differing = leftParts.findIndex((part, index) => part !== (rightParts[index] ?? 0));
  return differing === -1
    ? leftParts.length < rightParts.length
    : (leftParts[differing] ?? 0) < (rightParts[differing] ?? 0);
}

function ruffVersion(ruff: string): string | undefined {
  const result = spawnSync(ruff, ['--version'], { encoding: 'utf8', timeout: PROBE_TIMEOUT_MS });
  return result.status === 0 ? VERSION.exec(result.stdout)?.[1] : undefined;
}

export function installedRuffRules(ruff: string): RuffSnapshot | undefined {
  const result = spawnSync(ruff, ['rule', '--all', '--output-format', 'json'], {
    encoding: 'utf8',
    maxBuffer: MAXIMUM_OUTPUT,
    timeout: PROBE_TIMEOUT_MS,
  });
  const version = ruffVersion(ruff);
  return result.status === 0 && version !== undefined
    ? { version, rules: selectedRuffRules(parseRuffRules(result.stdout)) }
    : undefined;
}

export function withSelectedNewerRules(
  snapshot: RuffSnapshot,
  previous: RuffSnapshot,
): RuffSnapshot {
  const codes = new Set(snapshot.rules.map(({ code }) => code));
  const newer = previous.rules.filter(({ code }) => RUFF_SELECT.includes(code) && !codes.has(code));
  return {
    ...snapshot,
    rules: [...snapshot.rules, ...newer].toSorted((left, right) =>
      left.code.localeCompare(right.code),
    ),
  };
}
