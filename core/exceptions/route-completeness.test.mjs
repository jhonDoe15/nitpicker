import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_TOOLS,
  readCatalog,
  withRuleMessage,
} from '../../languages/java/messages/rule-messages.mjs';
import { RULE_HINTS, withHint } from '../../languages/python/rules/rule-hints.mjs';
import { hasRoute, routeProblems } from './test-support/route-check.mjs';

const GRADLE_ROOT = path.join(import.meta.dirname, '../../languages/java/gradle');
const JAVA_FILE = 'src/main/java/shop/Cart.java';
const PYTHON_FILE = 'src/shop/cart.py';
const PRESETS = ['java', 'kotlin'];

const finding = (tool, rule, file) => ({
  tool,
  rule,
  path: file,
  identity: `${rule}:1`,
  message: 'The base message.',
  classification: 'enforceable',
});

function rulesetRules() {
  return readdirSync(GRADLE_ROOT)
    .filter((file) => file.endsWith('ruleset.xml'))
    .flatMap((file) =>
      [...readFileSync(path.join(GRADLE_ROOT, file), 'utf8').matchAll(/<rule name="(\w+)"/gu)].map(
        ([, name]) => name,
      ),
    );
}

function catalogRules() {
  return CATALOG_TOOLS.flatMap((tool) =>
    Object.entries(readCatalog(tool)).map(([rule, entry]) => ({
      tool,
      rule,
      liftable: entry.mayBeIntended !== false,
    })),
  );
}

describe('every liftable Java and Kotlin finding ends with a route its preset accepts and that lifts it', () => {
  const cases = PRESETS.flatMap((preset) =>
    catalogRules().map((testCase) => ({ ...testCase, preset })),
  );

  it('covers the three catalogs', () => {
    expect(CATALOG_TOOLS).toEqual(['pmd', 'checkstyle', 'spotbugs']);
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('has no problem in any catalog rule', () => {
    const problems = cases.flatMap(({ tool, rule, liftable, preset }) => {
      const base = finding(tool, rule, JAVA_FILE);
      const { message } = withRuleMessage(base, { preset });
      return liftable
        ? routeProblems(base, message, preset).map(
            (problem) => `${preset} ${tool}/${rule}: ${problem}`,
          )
        : hasRoute(message)
          ? [`${preset} ${tool}/${rule}: a rule that cannot be intended has a route`]
          : [];
    });

    expect(problems).toEqual([]);
  });

  it('has no problem in any rule of the bundled rulesets', () => {
    const rules = rulesetRules();
    const problems = PRESETS.flatMap((preset) =>
      rules.flatMap((rule) => {
        const base = finding('pmd', rule, JAVA_FILE);
        return routeProblems(base, withRuleMessage(base, { preset }).message, preset).map(
          (problem) => `${preset} pmd/${rule}: ${problem}`,
        );
      }),
    );

    expect(rules.length).toBeGreaterThan(60);
    expect(problems).toEqual([]);
  });

  it('keeps the route out of the ruleset messages, which only the shared sentence supplies', () => {
    const handWritten = readdirSync(GRADLE_ROOT)
      .filter((file) => file.endsWith('ruleset.xml'))
      .filter((file) =>
        /nitpicker\.config|"exceptions"|add an exception/u.test(
          readFileSync(path.join(GRADLE_ROOT, file), 'utf8'),
        ),
      );

    expect(handWritten).toEqual([]);
  });
});

describe('every Python rule with a hint ends with a route the Python preset accepts and that lifts it', () => {
  const cases = RULE_HINTS.filter(({ prefix, rules }) => prefix !== true && rules !== undefined)
    .flatMap(({ tool, rules, exception }) =>
      [rules].flat().map((rule) => ({ tool, rule, routed: exception !== false })),
    )
    .filter(({ rule }) => rule !== 'no-import-outside-roots');

  it('has no problem in any hinted rule', () => {
    const problems = cases.flatMap(({ tool, rule, routed }) => {
      const base = finding(tool, rule, PYTHON_FILE);
      const { message } = withHint(base);
      return routed
        ? routeProblems(base, message, 'python').map((problem) => `${tool}/${rule}: ${problem}`)
        : hasRoute(message)
          ? [`${tool}/${rule}: a rule with no exception has a route`]
          : [];
    });

    expect(cases.length).toBeGreaterThan(50);
    expect(problems).toEqual([]);
  });
});
