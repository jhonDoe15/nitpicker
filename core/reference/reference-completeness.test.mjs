import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nitpickerRules } from '../../languages/typescript/preset/eslint-plugin/index.mjs';
import { i18nRuleIds } from '../../languages/typescript/preset/eslint-config/i18n/i18n-rules.mjs';
import {
  reactRuleIds,
  reactTestRuleIds,
} from '../../languages/typescript/preset/eslint-config/react/react-rules.mjs';
import { SPRING_ARCH_RULES } from '../../languages/java/adapters/spring-arch/spring-arch.mjs';
import { KOTLIN_EXCEPTION_RULES } from '../../languages/java/adapters/kotlin/kotlin-options.mjs';
import { KOTLIN_SOURCE_MESSAGES } from '../../languages/java/adapters/kotlin/scan/kotlin-scan.mjs';
import { leftOutPmdRules } from '../../languages/java/reference/pmd-rules.mjs';
import { CATALOG_TOOLS, readCatalog } from '../../languages/java/messages/rule-messages.mjs';
import {
  RUFF_IGNORE,
  RUFF_SELECT,
} from '../../languages/python/adapters/configuration/python-rule-ids.mjs';
import { PYTHON_TOP_LEVEL_EXCEPTION_RULES } from '../../languages/python/adapters/configuration/python-config.mjs';
import { RULE_HINTS } from '../../languages/python/rules/rule-hints.mjs';
import { RULES } from '../../shared/policy.mjs';
import {
  CODING_STANDARDS_RULES,
  DEPENDENCY_RULES,
  toolsOf,
} from '../../shared/exceptions/rule-tools.mjs';
import { PRESETS } from '../../shared/reference/entry.mjs';
import { PAGES } from '../../shared/reference/pages.mjs';
import {
  entryForFinding,
  indexEntries,
  lookupEntries,
  readReferenceEntries,
} from '../../shared/reference/store.mjs';

const entries = readReferenceEntries();
const index = indexEntries(entries);
const ERRORPRONE_CHECKS = JSON.parse(
  readFileSync(
    new URL('../../languages/java/gradle/errorprone/checks.json', import.meta.url),
    'utf8',
  ),
);
const DETEKT_DEFAULTS = JSON.parse(
  readFileSync(
    new URL('../../languages/java/reference/kotlin/detekt-default-rules.json', import.meta.url),
    'utf8',
  ),
);

function missingFindings(findings) {
  return findings
    .filter(({ tool, rule }) => entryForFinding(index, { tool, rule }) === undefined)
    .map(({ tool, rule }) => `${tool}/${rule}`);
}

function missingNames(names) {
  return names.filter((name) => lookupEntries(index, name).length === 0);
}

describe('the rule reference', () => {
  it('has one entry for each rule of the shared check catalog under every tool that prints it', () => {
    const findings = RULES.flatMap(({ id, check }) =>
      [check, ...(toolsOf(id) ?? [])].map((tool) => ({ tool, rule: id })),
    );

    expect(findings.length).toBeGreaterThan(RULES.length);
    expect(missingFindings(findings)).toEqual([]);
  });

  it('has an entry for each coding-standards and dependency-architecture rule', () => {
    expect(
      missingFindings([
        ...CODING_STANDARDS_RULES.map((rule) => ({ tool: 'coding-standards', rule })),
        ...DEPENDENCY_RULES.map((rule) => ({ tool: 'dependency-architecture', rule })),
      ]),
    ).toEqual([]);
  });

  it('has an entry for each rule of the Java message catalogs that the rulesets run', () => {
    const leftOut = leftOutPmdRules();
    const findings = CATALOG_TOOLS.flatMap((tool) =>
      Object.keys(readCatalog(tool))
        .filter((rule) => tool !== 'pmd' || !leftOut.includes(rule))
        .map((rule) => ({ tool, rule })),
    );

    expect(leftOut.length).toBeGreaterThan(0);
    expect(findings.length).toBeGreaterThan(CATALOG_TOOLS.length);
    expect(missingFindings(findings)).toEqual([]);
    expect(missingFindings(leftOut.map((rule) => ({ tool: 'pmd', rule })))).toEqual(
      leftOut.map((rule) => `pmd/${rule}`),
    );
  });

  it('has an entry for each Error Prone check the preset turns on and each Spring and Kotlin rule', () => {
    const turnedOn = ERRORPRONE_CHECKS.reviewedChecks.filter(
      (name) =>
        !ERRORPRONE_CHECKS.disable.includes(name) && !ERRORPRONE_CHECKS.defaultOff.includes(name),
    );

    expect(turnedOn.length).toBeGreaterThan(0);
    expect(
      missingFindings([
        ...turnedOn.map((rule) => ({ tool: 'errorprone', rule })),
        ...SPRING_ARCH_RULES.map((rule) => ({ tool: 'archunit', rule })),
        ...Object.keys(KOTLIN_SOURCE_MESSAGES).map((rule) => ({ tool: 'kotlin-source', rule })),
      ]),
    ).toEqual([]);
  });

  it('has an entry for each rule the Kotlin preset takes an exception for', () => {
    expect(KOTLIN_EXCEPTION_RULES.length).toBeGreaterThan(10);
    expect(missingNames(KOTLIN_EXCEPTION_RULES)).toEqual([]);
  });

  it('has an entry for each default rule of the pinned detekt', () => {
    const rules = Object.entries(DETEKT_DEFAULTS.active).flatMap(([ruleset, names]) =>
      names.map((name) => ({ tool: 'detekt', rule: `detekt.${ruleset}.${name}` })),
    );

    expect(rules.length).toBeGreaterThan(0);
    expect(missingFindings(rules)).toEqual([]);
  });

  it('has an entry for each rule of the nitpicker ESLint plugin and each React and i18n rule', () => {
    expect(
      missingNames([
        ...Object.keys(nitpickerRules.rules).map((rule) => `nitpicker/${rule}`),
        ...reactRuleIds,
        ...reactTestRuleIds,
        ...i18nRuleIds,
      ]),
    ).toEqual([]);
  });

  it('has an entry for each rule or rule family of the Python hints', () => {
    const hinted = RULE_HINTS.filter(({ rules }) => rules !== undefined).flatMap(
      ({ tool, rules, prefix }) =>
        [rules].flat().map((rule) => ({ tool, rule, prefix: prefix === true })),
    );
    const exact = hinted.filter(({ prefix }) => !prefix).map(({ tool, rule }) => `${tool}/${rule}`);
    const families = hinted.filter(({ prefix }) => prefix);

    expect(exact.length).toBeGreaterThan(0);
    expect(missingNames(exact)).toEqual([]);
    expect(
      families.filter(
        ({ tool, rule }) => !entries.some(({ id }) => id.startsWith(`${tool}/${rule}`)),
      ),
    ).toEqual([]);
  });

  it('has an entry for each ruff code or family the Python preset selects', () => {
    const ruffCodes = entries.filter(({ tool }) => tool === 'ruff').map(({ rule }) => rule);
    const unreported = RUFF_SELECT.filter(
      (selector) => !ruffCodes.some((code) => code.startsWith(selector)),
    );

    expect(RUFF_SELECT.length).toBeGreaterThan(0);
    expect(unreported).toEqual([]);
    expect(ruffCodes.filter((code) => RUFF_IGNORE.includes(code))).toEqual([]);
  });

  it('sends the Python exception of a shared check to python.exceptions unless the top-level list takes it', () => {
    const checks = entries.filter(
      ({ analyzers, exception }) =>
        analyzers.python !== undefined && exception.key === 'exceptions',
    );
    const sent = checks.filter(
      ({ exception }) => exception.presetKeys?.python === 'python.exceptions',
    );

    expect(sent.length).toBeGreaterThan(0);
    expect(
      sent.filter(({ exception }) => PYTHON_TOP_LEVEL_EXCEPTION_RULES.includes(exception.rule)),
    ).toEqual([]);
    expect(
      checks.filter(
        ({ tool, exception }) =>
          tool === exception.rule.split('/')[0] &&
          !exception.rule.includes('/') &&
          exception.presetKeys === undefined &&
          !PYTHON_TOP_LEVEL_EXCEPTION_RULES.includes(exception.rule),
      ),
    ).toEqual([]);
  });

  it('gives every entry an anchor on a page that exists, and every page an entry', () => {
    const pageIds = PAGES.map(({ id }) => id);

    expect(entries.filter(({ page }) => !pageIds.includes(page))).toEqual([]);
    expect(pageIds.filter((id) => !entries.some(({ page }) => page === id))).toEqual([]);
    expect(new Set(entries.map(({ anchor }) => anchor)).size).toBe(entries.length);
  });

  it('names a known preset and gives an exception shape or a reason for each entry', () => {
    for (const entry of entries) {
      expect(Object.keys(entry.analyzers).filter((preset) => !PRESETS.includes(preset))).toEqual(
        [],
      );
      expect(Object.keys(entry.analyzers).length).toBeGreaterThan(0);
      expect(entry.exception.key !== undefined || typeof entry.exception.note === 'string').toBe(
        true,
      );
      expect(typeof entry.summary).toBe('string');
    }
  });
});
