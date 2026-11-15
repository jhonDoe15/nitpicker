import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { textsOf } from '../../shared/values/readers.mts';
import { describe, expect, it } from 'vitest';
import {
  CATALOG_TOOLS as UNTYPED_CATALOG_TOOLS,
  readCatalog as untypedReadCatalog,
  withRuleMessage as untypedWithRuleMessage,
} from '../../languages/java/messages/rule-messages.mjs';
import {
  RULE_HINTS as UNTYPED_RULE_HINTS,
  withHint as untypedWithHint,
} from '../../languages/python/rules/rule-hints.mjs';
import { hasExceptionRoute as untypedHasRoute } from '../../shared/messages/exception-sentence.mjs';
import { routeProblems } from './test-support/route-check.mts';

type Finding = {
  tool: string;
  rule: string;
  path: string;
  identity: string;
  message: string;
  classification: string;
};
type Told = { message: string; allowedForm?: string };
type Hint = { tool: string; rules?: unknown; prefix?: unknown; exception?: unknown };

const CATALOG_TOOLS: readonly string[] = UNTYPED_CATALOG_TOOLS;
const readCatalog: (tool: string) => Record<string, { mayBeIntended?: boolean; fix?: unknown }> =
  untypedReadCatalog;
const withRuleMessage: (finding: Finding, options: { preset: string }) => Told =
  untypedWithRuleMessage;
const RULE_HINTS: readonly Hint[] = UNTYPED_RULE_HINTS;
const withHint: (finding: Finding) => Told = untypedWithHint;
const hasRoute: (message: string) => boolean = untypedHasRoute;

const GRADLE_ROOT = path.join(import.meta.dirname, '../../languages/java/gradle');
const JAVA_FILE = 'src/main/java/shop/Cart.java';
const PYTHON_FILE = 'src/shop/cart.py';
const PRESETS = ['java', 'kotlin'];

const finding = (tool: string, rule: string, file: string): Finding => ({
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
        ([, name = '']) => name,
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

  it('tells the fix of each catalog rule as its allowed form, and no other text', () => {
    const problems = cases.flatMap(({ tool, rule, preset }) => {
      const fix = readCatalog(tool)[rule]?.fix;
      const told = withRuleMessage(finding(tool, rule, JAVA_FILE), { preset });
      const stated = told.allowedForm === undefined || told.message.includes(told.allowedForm);
      const kept = typeof fix !== 'string' || told.allowedForm !== undefined;
      return stated && kept ? [] : [`${preset} ${tool}/${rule}`];
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
    .flatMap(({ tool, rules = [], exception }) =>
      textsOf([rules].flat()).map((rule) => ({ tool, rule, routed: exception !== false })),
    )
    .filter(({ rule }) => rule !== 'no-import-outside-roots');

  it('names the allowed form of a hinted rule as a field the message contains', () => {
    const problems = cases.flatMap(({ tool, rule }) => {
      const told = withHint(finding(tool, rule, PYTHON_FILE));
      return typeof told.allowedForm === 'string' && told.message.includes(told.allowedForm)
        ? []
        : [`${tool}/${rule}`];
    });

    expect(problems).toEqual([]);
  });

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
