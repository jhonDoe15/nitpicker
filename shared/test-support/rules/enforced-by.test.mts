import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutModulePath } from '../../paths/checkout-module.mts';
import { LANGUAGES, RULES } from '../../policy.mts';
import { FACT_RULE_LANGUAGES } from '../../project-rules/fact-rules.mts';
import { catalogFileOf, isKotlinPath, mentionsRule, ruleEmitters } from './rule-emitters.mts';

type Evidence = { readonly file: string; readonly evidence: RegExp };
type Documented = Readonly<Record<string, Readonly<Record<string, Evidence>>>>;
type Rule = (typeof RULES)[number];

const repositoryRoot = path.resolve(import.meta.dirname, '../../..');

const GO_REGISTERED_FACT_RULES_ONLY = {
  file: 'languages/go/adapters/facts/go-fact-findings.mts',
  evidence: /const registered = registeredFactRules\(LANGUAGE\)/u,
};
const GO_FACT_RULES_NOT_RUN = Object.fromEntries(
  ['exported-name-collision'].map((rule) => [rule, GO_REGISTERED_FACT_RULES_ONLY]),
);
const JVM_RUNTIME_EDGES_ONLY = {
  file: 'languages/java/adapters/test-runtime/test-graph.mts',
  evidence: /kind: EDGE_KINDS\.RUNTIME/u,
};
const NOT_ENFORCED_ALTHOUGH_EMITTED: Documented = {
  java: {
    'public-alternative-bypass': {
      file: 'languages/java/adapters/reuse/jvm-reuse-facts.mts',
      evidence: /kotlin \? kotlinEntryPointFindings/u,
    },
    'type-only-production-dependency': JVM_RUNTIME_EDGES_ONLY,
  },
  kotlin: {
    'type-only-production-dependency': JVM_RUNTIME_EDGES_ONLY,
  },
  go: {
    ...GO_FACT_RULES_NOT_RUN,
    'type-only-production-dependency': {
      file: 'languages/go/adapters/test-runtime/go-test-runtime.mts',
      evidence: /kind: EDGE_KINDS\.RUNTIME/u,
    },
    'domain-imports-framework-context': {
      file: 'languages/go/adapters/domain/go-domain-libraries.mts',
      evidence: /const WHOLE_PACKAGE_RULES[^=]*= \[\n {2}\[RULE_IDS\.domainImportsClient/u,
    },
    'inheritance-depth-limit': {
      file: 'languages/go/adapters/configuration/go-config.mts',
      evidence: /Go has no inheritance/u,
    },
  },
  javascript: {
    'unused-prop': {
      file: 'languages/typescript/preset/unused-api/analyze.mts',
      evidence: /!layout\.javascript\s*&&\s*isReactProject/u,
    },
    'javascript-in-typescript-project': {
      file: 'languages/typescript/preset/structure/sources/javascript-files.mts',
      evidence: /isJavascriptPolicy/u,
    },
  },
};

const emitters = new Map(
  LANGUAGES.map((language): [string, Map<string, string[]>] => [language, ruleEmitters(language)]),
);

function emittedBy(language: string, ruleId: string): string[] {
  return emitters.get(language)?.get(ruleId) ?? [];
}

const FACT_ENGINE: Evidence = {
  file: 'shared/rules/facts/evaluate.mts',
  evidence: /registeredFactRules/u,
};

function documented(language: string, ruleId: string): Evidence | undefined {
  return (
    NOT_ENFORCED_ALTHOUGH_EMITTED[language]?.[ruleId] ??
    (FACT_RULE_LANGUAGES[ruleId] === undefined ? undefined : FACT_ENGINE)
  );
}

function fixFor(id: string): string {
  return [
    `fix enforcedBy for ${id} in ${catalogFileOf(id)},`,
    'or add a NOT_ENFORCED_ALTHOUGH_EMITTED entry with evidence to this test',
  ].join(' ');
}

function disagreement(language: string, { id, enforcedBy }: Rule): string | undefined {
  const claimed = enforcedBy[language] !== false;
  const found = emittedBy(language, id);
  if (claimed && found.length === 0) {
    const marked = String(enforcedBy[language]);
    return `${language}: ${id} is marked ${marked} but no adapter emits it; ${fixFor(id)}`;
  }
  if (!claimed && found.length > 0 && documented(language, id) === undefined) {
    return `${language}: ${id} is marked not enforced but ${found[0] ?? ''} emits it; ${fixFor(id)}`;
  }
  const kotlinOnly = language === 'kotlin' && claimed && enforcedBy['java'] === false;
  if (kotlinOnly && !found.some(isKotlinPath)) {
    return `kotlin: ${id} is marked enforced but only Java adapters emit it; ${fixFor(id)}`;
  }
  return undefined;
}

function disagreements(): (string | undefined)[] {
  return LANGUAGES.flatMap((language) =>
    RULES.map((rule) => disagreement(language, rule)).filter((message) => message !== undefined),
  );
}

describe('the enforcedBy column of every catalogued rule', () => {
  it('names a language exactly when an adapter of that preset emits the rule', () => {
    expect(disagreements()).toEqual([]);
  });
  it('is emitted by at least one preset, whatever its column says', () => {
    const unused = RULES.filter(({ id }) =>
      LANGUAGES.every((language) => emittedBy(language, id).length === 0),
    ).map(({ id }) => id);

    expect(unused).toEqual([]);
  });
  it('leaves fact rules to the registry the fact engine runs them by', () => {
    const { file, evidence } = FACT_ENGINE;

    expect(readFileSync(path.join(repositoryRoot, file), 'utf8')).toMatch(evidence);
  });
  it('keeps every documented exception tied to code that still holds it', () => {
    const documented = Object.entries(NOT_ENFORCED_ALTHOUGH_EMITTED).flatMap(([language, rules]) =>
      Object.entries(rules).map(([ruleId, { file, evidence }]) => ({
        name: `${language} ${ruleId}`,
        enforced: RULES.find(({ id }) => id === ruleId)?.enforcedBy[language],
        emitted: emittedBy(language, ruleId).length > 0,
        evidenceHeld: evidence.test(
          readFileSync(checkoutModulePath(path.join(repositoryRoot, file)), 'utf8'),
        ),
      })),
    );
    expect(documented.map(({ name, enforced }) => [name, enforced])).toEqual(
      documented.map(({ name }) => [name, false]),
    );
    expect(documented.map(({ name, emitted }) => [name, emitted])).toEqual(
      documented.map(({ name }) => [name, true]),
    );
    expect(documented.map(({ name, evidenceHeld }) => [name, evidenceHeld])).toEqual(
      documented.map(({ name }) => [name, true]),
    );
  });
  it('finds the adapters that emit a rule in the language folders and the shared code they import, and counts only the rules a call of the shared fact evaluator lists', () => {
    const found = (language: string, ruleId: string, file: string): boolean =>
      emittedBy(language, ruleId).includes(file);

    expect([
      found(
        'python',
        'unused-dependency',
        'languages/python/adapters/dependencies/dependency-findings.mts',
      ),
      found(
        'typescript',
        'unused-dependency',
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mts',
      ),
      found('python', 'class-methods-limit', 'shared/rules/size/class-limits.mts'),
      found('python', 'committed-env-file', 'shared/hygiene/files/repository-files.mts'),
    ]).toEqual([true, true, true, true]);
    expect(emittedBy('java', 'unused-option')).toEqual([]);
    expect([
      emittedBy('java', 'mutable-state-escape'),
      emittedBy('java', 'duplicate-definition'),
      found(
        'typescript',
        'duplicate-definition',
        'languages/typescript/preset/structure/reuse/reuse-findings.mts',
      ),
    ]).toEqual([
      ['languages/java/adapters/design/design-findings.mts'],
      ['languages/java/adapters/reuse/jvm-reuse-facts.mts'],
      true,
    ]);
    expect(emittedBy('kotlin', 'unused-option')).toEqual([
      'languages/java/adapters/kotlin/review-rules/main/forwarding/forwarding-wrappers.mts',
      'languages/java/adapters/kotlin/review-rules/main/unused-options/call-reach.mts',
      'languages/java/adapters/kotlin/review-rules/main/unused-options/unused-option-gaps.mts',
      'languages/java/adapters/kotlin/review-rules/main/unused-options/unused-option-sites.mts',
      'languages/java/adapters/kotlin/review-rules/main/unused-options/unused-option-units.mts',
      'languages/java/adapters/kotlin/review-rules/main/unused-options/unused-options.mts',
      'languages/java/adapters/kotlin/review-rules/review-findings.mts',
      'languages/java/adapters/kotlin/review-rules/review-rules.mts',
      'languages/java/adapters/kotlin/review-rules/typed/kotlin-fact-types.mts',
      'languages/java/adapters/kotlin/review-rules/typed/review-context-types.mts',
    ]);
  });
  it('does not count a rule named only in a comment', () => {
    const rule = 'unused-dependency';

    expect([
      mentionsRule(
        'a.mjs',
        `// ${rule}\n/* ${rule} */\nconst url = 'https://example.com';\n`,
        rule,
      ),
      mentionsRule('a.py', `# ${rule}\n`, rule),
      mentionsRule('a.mjs', `const url = 'https://example.com'; const id = '${rule}';\n`, rule),
      mentionsRule('a.py', `RULE = "${rule}"\n`, rule),
    ]).toEqual([false, false, true, true]);
  });
  it('names the catalog file to fix', () => {
    expect([catalogFileOf('unused-dependency'), catalogFileOf('unused-prop')]).toEqual([
      'shared/project-rules/hygiene-rules.mts',
      'shared/unused-api/unused-api-policy.mts',
    ]);
  });
});
