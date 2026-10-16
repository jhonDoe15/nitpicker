import { describe, expect, it } from 'vitest';
import { lintFixture } from '../../../failure-messages/test-support/harness.mjs';
import { applyRuleExceptions } from '../../../eslint-config/exceptions.mjs';
import { strictSyntaxConfig } from '../../../eslint-config/strict.mjs';

const code = [
  'export const value = null;',
  'export function load(x: Promise<number>) { return x.then((m) => m + 1); }',
  'export default function Page() { return 1; }',
].join('\n');

function ruleIdsWith(exceptions) {
  const config = applyRuleExceptions(strictSyntaxConfig, exceptions);
  return lintFixture({ config, filename: 'src/app/page.ts', code }).map(({ ruleId }) => ruleId);
}

describe('the default-export, null and promise-chain bans', () => {
  it('report under their own rule ids', () => {
    expect(ruleIdsWith([])).toEqual([
      'nitpicker/no-null',
      'nitpicker/no-promise-chain',
      'nitpicker/no-default-export',
    ]);
  });

  it.each(['nitpicker/no-default-export', 'nitpicker/no-null', 'nitpicker/no-promise-chain'])(
    'let an exception for %s lift only that pattern',
    (rule) => {
      const exception = { rule, paths: ['src/app/**'], reason: 'Framework convention' };

      expect(ruleIdsWith([exception])).toEqual(
        ['nitpicker/no-null', 'nitpicker/no-promise-chain', 'nitpicker/no-default-export'].filter(
          (id) => id !== rule,
        ),
      );
    },
  );

  it('allow a default export in a config file', () => {
    const config = lintFixture({
      config: strictSyntaxConfig,
      filename: 'src/vite.config.ts',
      code: 'export default { plugins: [] };',
    });

    expect(config).toEqual([]);
  });
});
