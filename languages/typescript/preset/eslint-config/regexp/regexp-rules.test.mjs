import { describe, expect, it } from 'vitest';
import { eslintMessageWithHint } from '../../../adapters/hints/eslint-hints.mjs';
import { lintFixture } from '../../failure-messages/test-support/harness.mjs';
import { defaultResolvedLayout } from '../../layout.mjs';
import { isStrictRule } from '../../strict-rules.mjs';
import { productionPolicyConfigFor } from '../policy/production-policy.mjs';
import { regexpRuleHints, regexpRuleIds, regexpRules } from './regexp-rules.mjs';
import { regexpRuleCases } from './test-support/regexp-cases.mjs';

const config = productionPolicyConfigFor(defaultResolvedLayout);
const FILES = {
  typescript: 'src/main/features/a/adapters/x.ts',
  javascript: 'src/main/features/a/adapters/x.mjs',
};

function ruleIds(filename, code) {
  return lintFixture({ config, filename, code }).map(
    (message) => message.ruleId ?? message.message,
  );
}

const cases = Object.entries(FILES).flatMap(([language, filename]) =>
  regexpRuleCases.map(([rule, banned, allowed]) => [
    `regexp/${rule}`,
    language,
    filename,
    banned,
    allowed,
  ]),
);

describe('regular expression rules', () => {
  it('has a banned and an allowed fixture for every enabled rule', () => {
    const covered = regexpRuleCases.map(([rule]) => `regexp/${rule}`).toSorted();

    expect(covered).toEqual(regexpRuleIds);
  });

  it('enables every rule in the production policy and marks it strict', () => {
    expect(Object.keys(regexpRules())).toEqual(regexpRuleIds);
    expect(regexpRuleIds.filter((rule) => !isStrictRule(rule))).toEqual([]);
  });

  it.each(cases)('%s rejects the banned form in %s', (rule, _language, filename, banned) => {
    expect(ruleIds(filename, banned)).toContain(rule);
  });

  it.each(cases)(
    '%s allows the simpler form in %s',
    (_rule, _language, filename, _banned, allowed) => {
      expect(ruleIds(filename, allowed)).toEqual([]);
    },
  );

  it('leaves a quadratic suffix trim to the reviewer', () => {
    expect(
      ruleIds(
        FILES.typescript,
        'export const trim = (path: string): string => path.replace(/\\/+$/u, "");',
      ),
    ).toEqual([]);
  });

  it.each(regexpRuleHints())('appends the fix to %s', (ruleId, hint) => {
    const message = eslintMessageWithHint({
      ruleId,
      text: 'Unexpected pattern.',
      relativePath: FILES.typescript,
    });

    expect(message).toBe(`Unexpected pattern.${hint}`);
  });
});
