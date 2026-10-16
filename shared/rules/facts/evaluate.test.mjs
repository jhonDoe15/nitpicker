import { describe, expect, it } from 'vitest';
import { RULES } from '../../policy.mjs';
import { sharedFactFindings } from './evaluate.mjs';
import {
  FACT_RULE_LANGUAGES,
  FACT_RULE_LISTS,
  registeredFactRules,
  sharedFactExceptionRules,
} from './registry.mjs';
import { exception, fixtureFindings, rows } from './test-support/fact-fixtures.mjs';

const CONSOLE = 'test-console-output';

describe('the shared fact rules', () => {
  it('registers rules the catalog knows, each with the lists it reads', () => {
    const ids = RULES.map(({ id }) => id);

    expect(Object.keys(FACT_RULE_LANGUAGES).filter((rule) => !ids.includes(rule))).toEqual([]);
    expect(Object.keys(FACT_RULE_LISTS).toSorted()).toEqual(
      Object.keys(FACT_RULE_LANGUAGES).toSorted(),
    );
  });

  it('states each registered language in the checks table', () => {
    for (const [rule, languages] of Object.entries(FACT_RULE_LANGUAGES)) {
      const { enforcedBy } = RULES.find(({ id }) => id === rule);
      for (const language of languages) expect(enforcedBy[language], rule).toBeTruthy();
    }
  });

  it('runs every rule registered for a language', () => {
    expect(registeredFactRules('typescript')).toEqual(Object.keys(FACT_RULE_LANGUAGES));
    expect(registeredFactRules('cobol')).toEqual([]);
  });

  it('fails when a registered rule has no facts to read', () => {
    expect(() =>
      sharedFactFindings({ console: [] }, { language: 'typescript', analyzerName: 'facts' }),
    ).toThrow(/duplicate-definition needs "definitions"/u);
  });

  it('fails for a rule the language does not register', () => {
    expect(() =>
      sharedFactFindings(
        { console: [] },
        { language: 'cobol', analyzerName: 'facts', rules: [CONSOLE] },
      ),
    ).toThrow(/test-console-output is not registered for cobol/u);
  });

  it('lets every preset lift a rule once a language besides TypeScript registers it', () => {
    expect(sharedFactExceptionRules()).toEqual([]);
    FACT_RULE_LANGUAGES[CONSOLE].push('java');
    try {
      expect(sharedFactExceptionRules()).toEqual([CONSOLE]);
      expect(registeredFactRules('java')).toEqual([CONSOLE]);
    } finally {
      FACT_RULE_LANGUAGES[CONSOLE].pop();
    }
  });

  it('runs nothing for a language that registers nothing', () => {
    expect(sharedFactFindings({}, { language: 'cobol', analyzerName: 'facts' })).toEqual([]);
  });
});

describe('test-console-output over facts', () => {
  it('reports each test file that printed, from any runner', () => {
    expect(rows(fixtureFindings('console', [CONSOLE])).map(([, file]) => file)).toEqual([
      'src/test/java/com/acme/CartTest.java',
      'tests/test_cart.py',
      'tests/test_legacy.py',
    ]);
  });

  it('normalizes numbers and names the test', () => {
    const [finding] = fixtureFindings('console', [CONSOLE]);

    expect(finding.message).toContain(
      '"WARN c.a.Cart - stock for item <n> is negative" (test "addsItem")',
    );
    expect(finding.tokens).toEqual([
      'WARN',
      'c.a.Cart',
      '-',
      'stock',
      'for',
      'item',
      '<n>',
      'is',
      'negative',
    ]);
  });

  it('applies the testConsole allowlist and exceptions from the policy', () => {
    const policy = {
      testConsole: { allow: [{ contains: 'datetime.utcnow() is deprecated', reason: 'library' }] },
      exceptions: [exception(CONSOLE, 'tests/test_legacy.py')],
    };

    expect(rows(fixtureFindings('console', [CONSOLE], { policy })).map(([, file]) => file)).toEqual(
      ['src/test/java/com/acme/CartTest.java'],
    );
  });
});
