import { describe, expect, it } from 'vitest';
import { LANGUAGES, RULES } from '../../policy.mjs';
import { exceptionHint } from '../exceptions.mjs';
import { sharedFactFindings } from './evaluate.mjs';
import {
  FACT_RULE_LANGUAGES,
  FACT_RULE_LISTS,
  registeredFactRules,
  sharedFactExceptionRules,
} from '../../project-rules/fact-rules.mjs';
import {
  exception,
  fixtureFindings,
  rows,
  withLanguageRegistered,
} from './test-support/fact-fixtures.mjs';

const CONSOLE = 'test-console-output';

describe('the shared fact rules', () => {
  it('registers rules the catalog knows, each with the lists it reads', () => {
    const ids = RULES.map(({ id }) => id);

    expect(Object.keys(FACT_RULE_LANGUAGES).filter((rule) => !ids.includes(rule))).toEqual([]);
    expect(Object.keys(FACT_RULE_LISTS).toSorted()).toEqual(
      Object.keys(FACT_RULE_LANGUAGES).toSorted(),
    );
  });

  it('is the one source of the checks table columns for a registered rule', () => {
    for (const [rule, languages] of Object.entries(FACT_RULE_LANGUAGES)) {
      expect(Object.keys(languages).toSorted(), rule).toEqual(LANGUAGES.toSorted());
      expect(RULES.find(({ id }) => id === rule).enforcedBy, rule).toEqual(languages);
    }
  });

  it('runs every rule registered for a language', () => {
    expect(registeredFactRules('typescript')).toEqual(Object.keys(FACT_RULE_LANGUAGES));
    expect(registeredFactRules('javascript')).toEqual(Object.keys(FACT_RULE_LANGUAGES));
    expect(registeredFactRules('cobol')).toEqual([]);
  });

  it('fails when a registered rule has no facts to read', () => {
    expect(() =>
      sharedFactFindings({ console: [] }, { language: 'typescript', analyzerName: 'facts' }),
    ).toThrow(/duplicate-definition needs "modules"; duplicate-definition needs "packages"/u);
  });

  it('fails for a rule the language does not register', () => {
    expect(() =>
      sharedFactFindings(
        { console: [] },
        { language: 'cobol', analyzerName: 'facts', rules: [CONSOLE] },
      ),
    ).toThrow(/test-console-output is not registered for cobol/u);
  });

  it.each([['cobol'], ['typscript']])(
    'fails for %s, which registers no rule, instead of finding nothing',
    (language) => {
      expect(() => sharedFactFindings({}, { language, analyzerName: 'facts' })).toThrow(
        `No fact rule is registered for language "${language}" in FACT_RULE_LANGUAGES (shared/project-rules/fact-rules.mjs)`,
      );
    },
  );

  it('fails for an empty rule list instead of finding nothing', () => {
    expect(() =>
      sharedFactFindings({ console: [] }, { language: 'typescript', analyzerName: 'f', rules: [] }),
    ).toThrow('"rules" must name at least one registered fact rule, or be left out');
  });

  it.each([
    ['x', 'policy must be an object'],
    [{ exceptions: 'x' }, 'policy.exceptions must be an array of { rule, paths } entries'],
    [
      { exceptions: [{ rule: 'test-console-output' }] },
      'policy.exceptions must be an array of { rule, paths } entries',
    ],
    [
      { testConsole: { allow: [{ contains: 5 }] } },
      'policy.testConsole.allow must be an array of { contains, paths? } entries',
    ],
    [
      { layout: { sharedRoots: 'x' } },
      'policy.layout.sharedRoots must be an array of folder globs',
    ],
    [
      { layout: { featureRoots: [1] } },
      'policy.layout.featureRoots must be an array of folder globs',
    ],
    [{ testConsole: 'x' }, 'policy.testConsole must be an object'],
    [{ layout: 'x' }, 'policy.layout must be an object'],
    [{ layout: [] }, 'policy.layout must be an object'],
  ])('names the bad policy field in %j', (policy, message) => {
    expect(() =>
      sharedFactFindings(
        { console: [] },
        { language: 'typescript', analyzerName: 'facts', rules: [CONSOLE], policy },
      ),
    ).toThrow(new TypeError(`${message}: pass the head policy (readHeadPolicyFile())`));
  });

  it.each([[undefined], [''], [3]])('rejects %j as the analyzer name', (analyzerName) => {
    expect(() =>
      sharedFactFindings(
        { console: [] },
        { language: 'typescript', analyzerName, rules: [CONSOLE] },
      ),
    ).toThrow(
      new TypeError('"analyzerName" must be a non-empty string: the analyzer the findings are for'),
    );
  });

  it.each([['x'], [{}], [{ movesFile: 'moves.json' }]])(
    'rejects %j as the baseline',
    (baseline) => {
      expect(() =>
        sharedFactFindings(
          { console: [] },
          { language: 'typescript', analyzerName: 'f', rules: [CONSOLE], baseline },
        ),
      ).toThrow(
        new TypeError('baseline must be { readFile } or { facts, movesFile? }, or be left out'),
      );
    },
  );

  it('says a bad fact comes from the baseline', () => {
    const baseline = { facts: { modules: [{ file: './a.ts', role: 'production' }] } };

    expect(() =>
      sharedFactFindings(
        { console: [] },
        { language: 'typescript', analyzerName: 'f', rules: [CONSOLE], baseline },
      ),
    ).toThrow(/^baseline facts\.modules\[0\]\.file is "\.\/a\.ts"/u);
  });

  it('lets every preset lift a rule once a language besides TypeScript registers it', () => {
    const python = ['duplicate-definition', 'exported-name-collision', 'test-only-export', CONSOLE];
    expect(sharedFactExceptionRules()).toEqual(python);
    expect(registeredFactRules('python')).toEqual(python);
    withLanguageRegistered('doc-comment-content', 'python', () => {
      expect(sharedFactExceptionRules()).toEqual([
        'duplicate-definition',
        'exported-name-collision',
        'test-only-export',
        'doc-comment-content',
        CONSOLE,
      ]);
    });
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

    expect(finding.message).toBe(
      `Tests print new console output: "WARN c.a.Cart - stock for item <n> is negative" (test "addsItem"). Fix the cause (for example a timer that outlives the test), or allow a third-party message in "testConsole.allow" of nitpicker.config.json. ${exceptionHint(CONSOLE, 'src/test/java/com/acme/CartTest.java')}`,
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
