import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { nitpickerRules } from '../../languages/typescript/preset/eslint-plugin/index.mts';
import { i18nRuleIds as untypedI18nRuleIds } from '../../languages/typescript/preset/eslint-config/i18n/i18n-rules.mjs';
import {
  reactRuleIds as untypedReactRuleIds,
  reactTestRuleIds as untypedReactTestRuleIds,
} from '../../languages/typescript/preset/eslint-config/react/react-rules.mjs';
import { SPRING_ARCH_RULES as UNTYPED_SPRING_ARCH_RULES } from '../../languages/java/adapters/spring-arch/spring-arch.mts';
import { KOTLIN_EXCEPTION_RULES as UNTYPED_KOTLIN_EXCEPTION_RULES } from '../../languages/java/adapters/kotlin/kotlin-options.mts';
import { KOTLIN_SOURCE_MESSAGES as UNTYPED_KOTLIN_SOURCE_MESSAGES } from '../../languages/java/adapters/kotlin/scan/kotlin-scan.mts';
import { leftOutPmdRules as untypedLeftOutPmdRules } from '../../languages/java/reference/pmd-rules.mts';
import {
  CATALOG_TOOLS as UNTYPED_CATALOG_TOOLS,
  readCatalog as untypedReadCatalog,
} from '../../languages/java/messages/rule-messages.mts';
import {
  RUFF_IGNORE as UNTYPED_RUFF_IGNORE,
  RUFF_SELECT as UNTYPED_RUFF_SELECT,
} from '../../languages/python/adapters/configuration/python-rule-ids.mts';
import { PYTHON_TOP_LEVEL_EXCEPTION_RULES as UNTYPED_PYTHON_TOP_LEVEL_EXCEPTION_RULES } from '../../languages/python/adapters/configuration/python-config.mts';
import { RULE_HINTS as UNTYPED_RULE_HINTS } from '../../languages/python/rules/rule-hints.mts';
import { RULES as UNTYPED_RULES } from '../../shared/policy.mjs';
import {
  CODING_STANDARDS_RULES as UNTYPED_CODING_STANDARDS_RULES,
  DEPENDENCY_RULES as UNTYPED_DEPENDENCY_RULES,
  toolsOf as untypedToolsOf,
} from '../../shared/exceptions/rule-tools.mjs';
import {
  PAGES,
  PRESETS,
  entryForFinding,
  indexEntries,
  lookupEntries,
  readReferenceEntries,
} from './reference-views.mts';
import { fieldAt, fieldsOf } from '../../scripts/json/fields.mts';
import { parseJson, textsOf } from '../../shared/values/readers.mts';

type Hint = { tool: string; rules?: unknown; prefix?: unknown };

const i18nRuleIds: readonly string[] = untypedI18nRuleIds;
const reactRuleIds: readonly string[] = untypedReactRuleIds;
const reactTestRuleIds: readonly string[] = untypedReactTestRuleIds;
const SPRING_ARCH_RULES: readonly string[] = UNTYPED_SPRING_ARCH_RULES;
const KOTLIN_EXCEPTION_RULES: readonly string[] = UNTYPED_KOTLIN_EXCEPTION_RULES;
const KOTLIN_SOURCE_MESSAGES: unknown = UNTYPED_KOTLIN_SOURCE_MESSAGES;
const leftOutPmdRules: () => string[] = untypedLeftOutPmdRules;
const CATALOG_TOOLS: readonly string[] = UNTYPED_CATALOG_TOOLS;
const readCatalog: (tool: string) => Readonly<Record<string, unknown>> = untypedReadCatalog;
const RUFF_IGNORE: readonly string[] = textsOf(UNTYPED_RUFF_IGNORE);
const RUFF_SELECT: readonly string[] = textsOf(UNTYPED_RUFF_SELECT);
const PYTHON_TOP_LEVEL_EXCEPTION_RULES: readonly string[] =
  UNTYPED_PYTHON_TOP_LEVEL_EXCEPTION_RULES;
const RULE_HINTS: readonly Hint[] = UNTYPED_RULE_HINTS;
const RULES: readonly { id: string; check: string }[] = UNTYPED_RULES;
const CODING_STANDARDS_RULES: readonly string[] = textsOf(UNTYPED_CODING_STANDARDS_RULES);
const DEPENDENCY_RULES: readonly string[] = textsOf(UNTYPED_DEPENDENCY_RULES);
const toolsOf: (rule: string) => string[] | undefined = untypedToolsOf;

const entries = readReferenceEntries();
const index = indexEntries(entries);
const ERRORPRONE_CHECKS: unknown = parseJson(
  readFileSync(
    new URL('../../languages/java/gradle/errorprone/checks.json', import.meta.url),
    'utf8',
  ),
);
const DETEKT_DEFAULTS: unknown = parseJson(
  readFileSync(
    new URL('../../languages/java/reference/kotlin/detekt-default-rules.json', import.meta.url),
    'utf8',
  ),
);

function missingFindings(findings: { tool: string; rule: string }[]) {
  return findings
    .filter(({ tool, rule }) => entryForFinding(index, { tool, rule }) === undefined)
    .map(({ tool, rule }) => `${tool}/${rule}`);
}

function missingNames(names: readonly string[]) {
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

  it('has a Java entry for each rule of every PMD ruleset the Java build writes', () => {
    const gradle = new URL('../../languages/java/gradle/', import.meta.url);
    const files = [
      ...readdirSync(gradle).filter((file) => file.endsWith('ruleset.xml')),
      ...readdirSync(new URL('rules/', gradle))
        .filter((file) => file.endsWith('ruleset.xml'))
        .map((file) => `rules/${file}`),
    ];
    const rules = files.flatMap((file) =>
      [...readFileSync(new URL(file, gradle), 'utf8').matchAll(/<rule\s+name="(\w+)"/gu)].map(
        ([, rule = '']) => rule,
      ),
    );

    expect(files.includes('rules/guards-ruleset.xml')).toBe(true);
    expect(files.includes('rules/test-honesty-ruleset.xml')).toBe(true);
    expect(rules.includes('OptionalGet')).toBe(true);
    expect(missingFindings(rules.map((rule) => ({ tool: 'pmd', rule })))).toEqual([]);
    expect(
      rules
        .map((rule) => entryForFinding(index, { tool: 'pmd', rule }))
        .filter((entry) => !JSON.stringify(fieldAt(entry, 'analyzers')).includes('java')),
    ).toEqual([]);
  });

  it('has an entry for each Error Prone check the preset turns on and each Spring and Kotlin rule', () => {
    const disabled = textsOf(fieldAt(ERRORPRONE_CHECKS, 'disable'));
    const defaultOff = textsOf(fieldAt(ERRORPRONE_CHECKS, 'defaultOff'));
    const turnedOn = textsOf(fieldAt(ERRORPRONE_CHECKS, 'reviewedChecks')).filter(
      (name) => !(disabled.includes(name) || defaultOff.includes(name)),
    );

    expect(turnedOn.length).toBeGreaterThan(0);
    expect(
      missingFindings([
        ...turnedOn.map((rule) => ({ tool: 'errorprone', rule })),
        ...SPRING_ARCH_RULES.map((rule) => ({ tool: 'archunit', rule })),
        ...Object.keys(fieldsOf(KOTLIN_SOURCE_MESSAGES) ?? {}).map((rule) => ({
          tool: 'kotlin-source',
          rule,
        })),
      ]),
    ).toEqual([]);
  });

  it('has an entry for each rule the Kotlin preset takes an exception for', () => {
    expect(KOTLIN_EXCEPTION_RULES.length).toBeGreaterThan(10);
    expect(missingNames(KOTLIN_EXCEPTION_RULES)).toEqual([]);
  });

  it('has an entry for each default rule of the pinned detekt', () => {
    const rules = Object.entries(fieldsOf(fieldAt(DETEKT_DEFAULTS, 'active')) ?? {}).flatMap(
      ([ruleset, names]) =>
        textsOf(names).map((name) => ({ tool: 'detekt', rule: `detekt.${ruleset}.${name}` })),
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
        textsOf([rules].flat()).map((rule) => ({ tool, rule, prefix: prefix === true })),
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
        analyzers['python'] !== undefined && exception.key === 'exceptions',
    );
    const sent = checks.filter(
      ({ exception }) => exception.presetKeys?.['python'] === 'python.exceptions',
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
    const malformed = entries
      .filter(
        (entry) =>
          Object.keys(entry.analyzers).some((preset) => !PRESETS.includes(preset)) ||
          Object.keys(entry.analyzers).length === 0 ||
          (entry.exception.key === undefined && typeof entry.exception.note !== 'string') ||
          typeof entry.summary !== 'string',
      )
      .map(({ id }) => id);

    expect(entries.length).toBeGreaterThan(0);
    expect(malformed).toEqual([]);
  });
});
