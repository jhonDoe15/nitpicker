import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, RULES } from '../policy.mjs';
import { catalogFileOf, isKotlinPath, mentionsRule, ruleEmitters } from './rule-emitters.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

const NOT_ENFORCED_ALTHOUGH_EMITTED = {
  go: {
    'inheritance-depth-limit': {
      file: 'languages/go/adapters/configuration/go-config.mjs',
      evidence: /Go has no inheritance/u,
    },
  },
  javascript: {
    'unused-prop': {
      file: 'languages/typescript/preset/unused-api/analyze.mjs',
      evidence: /javascript: layout\.javascript/u,
    },
    'unused-option': {
      file: 'languages/typescript/preset/unused-api/analyze.mjs',
      evidence: /isTypeScriptFile/u,
    },
    'javascript-in-typescript-project': {
      file: 'languages/typescript/preset/structure/sources/javascript-files.mjs',
      evidence: /isJavascriptPolicy/u,
    },
  },
};

const emitters = Object.fromEntries(
  LANGUAGES.map((language) => [language, ruleEmitters(language)]),
);

function documented(language, ruleId) {
  return NOT_ENFORCED_ALTHOUGH_EMITTED[language]?.[ruleId];
}

function fixFor(id) {
  return [
    `fix enforcedBy for ${id} in ${catalogFileOf(id)},`,
    'or add a NOT_ENFORCED_ALTHOUGH_EMITTED entry with evidence to this test',
  ].join(' ');
}

function disagreement(language, { id, enforcedBy }) {
  const claimed = enforcedBy[language] !== false;
  const found = emitters[language].get(id);
  if (claimed && found.length === 0) {
    const marked = String(enforcedBy[language]);
    return `${language}: ${id} is marked ${marked} but no adapter emits it; ${fixFor(id)}`;
  }
  if (!claimed && found.length > 0 && documented(language, id) === undefined) {
    return `${language}: ${id} is marked not enforced but ${found[0]} emits it; ${fixFor(id)}`;
  }
  const kotlinOnly = language === 'kotlin' && claimed && enforcedBy.java === false;
  if (kotlinOnly && !found.some(isKotlinPath)) {
    return `kotlin: ${id} is marked enforced but only Java adapters emit it; ${fixFor(id)}`;
  }
  return undefined;
}

function disagreements() {
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
      LANGUAGES.every((language) => emitters[language].get(id).length === 0),
    ).map(({ id }) => id);

    expect(unused).toEqual([]);
  });
  it('keeps every documented exception tied to code that still holds it', () => {
    const documented = Object.entries(NOT_ENFORCED_ALTHOUGH_EMITTED).flatMap(([language, rules]) =>
      Object.entries(rules).map(([ruleId, { file, evidence }]) => ({
        name: `${language} ${ruleId}`,
        enforced: RULES.find(({ id }) => id === ruleId).enforcedBy[language],
        emitted: emitters[language].get(ruleId).length > 0,
        evidenceHeld: evidence.test(readFileSync(path.join(repositoryRoot, file), 'utf8')),
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
    const found = (language, ruleId, file) => emitters[language].get(ruleId).includes(file);

    expect([
      found(
        'python',
        'unused-dependency',
        'languages/python/adapters/dependencies/dependency-findings.mjs',
      ),
      found(
        'typescript',
        'unused-dependency',
        'languages/typescript/adapters/quality-areas/reporting/dead-code.mjs',
      ),
      found('python', 'class-methods-limit', 'shared/rules/size/class-limits.mjs'),
      found('python', 'committed-env-file', 'shared/hygiene/files/repository-files.mjs'),
    ]).toEqual([true, true, true, true]);
    expect(emitters.java.get('unused-option')).toEqual([]);
    expect([
      emitters.java.get('mutable-state-escape'),
      emitters.java.get('duplicate-definition'),
      found(
        'typescript',
        'duplicate-definition',
        'languages/typescript/preset/structure/reuse/reuse-findings.mjs',
      ),
    ]).toEqual([
      ['languages/java/adapters/design/design-findings.mjs'],
      ['languages/java/adapters/reuse/jvm-reuse-facts.mjs'],
      true,
    ]);
    expect(emitters.kotlin.get('unused-option')).not.toEqual([]);
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
      'shared/project-rules/hygiene-rules.mjs',
      'shared/unused-api/unused-api-policy.mjs',
    ]);
  });
});
