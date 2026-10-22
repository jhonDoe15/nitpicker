import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LANGUAGES, RULES } from '../policy.mjs';
import { ruleEmitters } from './rule-emitters.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '../..');

const REPORT_ONLY_KOTLIN_MUTANTS = {
  file: 'languages/java/adapters/reporting/kotlin-reports.mjs',
  evidence: /reportOnlyKotlinMutants/u,
};
const NOT_ENFORCED_ALTHOUGH_EMITTED = {
  kotlin: {
    'mutant-survived': REPORT_ONLY_KOTLIN_MUTANTS,
    'mutant-nocoverage': REPORT_ONLY_KOTLIN_MUTANTS,
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

function disagreements() {
  return LANGUAGES.flatMap((language) =>
    RULES.flatMap(({ id, enforcedBy }) => {
      const claimed = enforcedBy[language] !== false;
      const emitted = emitters[language].get(id).length > 0;
      if (claimed && !emitted) {
        return [
          `${language}: ${id} is marked ${String(enforcedBy[language])} but no adapter emits it`,
        ];
      }
      if (!claimed && emitted && documented(language, id) === undefined) {
        return [
          `${language}: ${id} is marked not enforced but ${emitters[language].get(id)[0]} emits it`,
        ];
      }
      return [];
    }),
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
    for (const [language, rules] of Object.entries(NOT_ENFORCED_ALTHOUGH_EMITTED)) {
      for (const [ruleId, { file, evidence }] of Object.entries(rules)) {
        const rule = RULES.find(({ id }) => id === ruleId);
        expect(rule.enforcedBy[language], `${language} ${ruleId}`).toBe(false);
        expect(emitters[language].get(ruleId), `${language} ${ruleId}`).not.toEqual([]);
        expect(readFileSync(path.join(repositoryRoot, file), 'utf8'), file).toMatch(evidence);
      }
    }
  });
  it('finds the adapters that emit a rule in the language folders and the shared code they import', () => {
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
    expect(emitters.kotlin.get('unused-option')).not.toEqual([]);
  });
});
