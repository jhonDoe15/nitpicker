import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { resolveLayout as untypedResolveLayout } from '../../../layout.mts';
import { type ResolvedLayout, linterConfigs } from '../../typed/config-types.mts';
import { lintFixture } from '../../typed/lint-fixture.mts';
import { testHonestyConfigFor } from '../index.mts';

const resolveLayout: () => ResolvedLayout = untypedResolveLayout;
const config = linterConfigs([
  { languageOptions: { parser: tseslint.parser } },
  ...testHonestyConfigFor(resolveLayout()),
]);
const PLAYWRIGHT_TEST = [
  "test('total', async ({ page }) => {",
  "  await page.waitForLoadState('networkidle');",
  "  expect(await page.locator('.total').textContent()).toBe('42');",
  "  expect(page.getByRole('row')).toHaveCount(2);",
  '  await page.pause();',
  "  const rows = await page.$$('tr');",
  '});',
].join('\n');
const CYPRESS_TEST = [
  "it('saves', async () => {",
  "  const button = cy.get('button');",
  '  cy.pause();',
  '});',
  'beforeEach(async () => { cy.visit("/"); });',
].join('\n');

function browserRuleIds(filename: string, code: string): (string | null)[] {
  return lintFixture({ config, filename, code })
    .map(({ ruleId }) => ruleId)
    .filter((id) => id?.startsWith('playwright/') === true || id?.startsWith('cypress/') === true);
}

describe('browser test rules', () => {
  it('report one-shot reads, idle waits, unawaited assertions and handles in Playwright tests', () => {
    const code = `import { expect, test } from '@playwright/test';\n${PLAYWRIGHT_TEST}`;

    expect(browserRuleIds('e2e/total.spec.ts', code)).toEqual([
      'playwright/no-networkidle',
      'playwright/prefer-web-first-assertions',
      'playwright/missing-playwright-await',
      'playwright/no-page-pause',
      'playwright/no-element-handle',
    ]);
  });

  it('leave files that do not import Playwright alone', () => {
    const code = `import { expect, test } from 'vitest';\n${PLAYWRIGHT_TEST}`;

    expect(browserRuleIds('test/total.test.ts', code)).toEqual([]);
  });

  it('report kept command results, async tests and hooks and pauses in Cypress tests', () => {
    expect(browserRuleIds('e2e/save.cy.ts', CYPRESS_TEST)).toEqual([
      'cypress/no-async-tests',
      'cypress/no-async-tests',
      'cypress/no-assigning-return-values',
      'cypress/no-pause',
    ]);
    expect(browserRuleIds('test/save.test.ts', CYPRESS_TEST.replaceAll('cy.', 'api.'))).toEqual([]);
  });

  it('name the allowed form in the message', () => {
    const code = `import { expect, test } from '@playwright/test';\n${PLAYWRIGHT_TEST}`;
    const read = lintFixture({ config, filename: 'e2e/total.spec.ts', code }).find(
      ({ ruleId }) => ruleId === 'playwright/prefer-web-first-assertions',
    );

    expect(read?.message).toBe(
      "Replace textContent() with toHaveText(). It reads the page once, so the assertion fails when the page is still updating. Use the assertion that retries until it passes: `await expect(page.getByRole(...)).toBeVisible()`, `await expect(locator).toHaveText('42')`.",
    );
  });
});
