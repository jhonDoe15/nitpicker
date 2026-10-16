import { RuleTester } from 'eslint';
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule as noFixedSleepSynchronization } from '../rules/testing/lifecycle/no-fixed-sleep-synchronization.mjs';

Object.assign(RuleTester, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  it,
  itOnly: it.only,
});
const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parser: tseslint.parser },
});

ruleTester.run(
  'no-fixed-sleep-synchronization: waits on wall-clock time',
  noFixedSleepSynchronization,
  {
    valid: [
      ...[
        'await expect(waitFor(() => ready())).resolves.toBeUndefined();',
        "await expect(screen.findByRole('tooltip')).resolves.toBeDefined();",
        "expect(screen.queryByRole('tooltip')).toBeNull();",
        'await expect(load()).rejects.toThrow("boom");',
        'await expect(someQuery()).rejects.toThrow();',
        'await expect(findings()).rejects.toThrow();',
        "await expect(screen.getByRole('tooltip')).rejects;",
        'vi.advanceTimersByTime(500);',
        'await page.waitForSelector(".ready");',
        'await expect(locator).toBeVisible();',
        'waitForTimeout(500);',
        "cy.wait('@request');",
        "cy.wait(['@first', '@second']);",
        "const alias = '@request'; cy.wait(alias);",
        'cy.wait(elapsed());',
        'cy.wait(duration);',
        'clock.wait(500);',
        'cy.wait(0);',
        "await expect(repo.findByEmail('a@example.com')).rejects.toThrow();",
        'await expect(service.findById(1)).rejects.toThrow();',
        "await expect(queue.waitFor('job')).rejects.toThrow();",
        "const missing = repo.findByEmail('a'); await expect(missing).rejects.toThrow();",
        "await expect(repo.findAllByTag('x')).rejects.toThrow();",
        "await expect(users.within(range).findByName('a')).rejects.toThrow();",
        "await expect(findByEmail('a')).rejects.toThrow();",
        "import { findByRole } from './queries.js'; await expect(findByRole('x')).rejects.toThrow();",
        "const { findByRole } = createFinder(); await expect(findByRole('x')).rejects.toThrow();",
        'cy.get(".ready").should("be.visible");',
      ].map((code) => ({ filename: '/repo/tests/e2e/flow.spec.ts', code })),
      {
        filename: '/repo/tests/fixtures/pause.ts',
        code: 'await page.waitForTimeout(500); cy.wait(500);',
      },
    ],
    invalid: [
      ...[
        "await expect(waitFor(() => screen.getByRole('tooltip'))).rejects.toThrow();",
        "await expect(vi.waitFor(() => screen.getByRole('tooltip'))).rejects.toThrow();",
        'expect(vi.waitFor(() => ready())).rejects.toThrow();',
        "await expect(screen.findByRole('tooltip')).rejects.toThrow();",
        "await expect(screen.findAllByText('Row')).rejects.toThrow();",
        "const { findByRole } = render(<Tip />); await expect(findByRole('tooltip')).rejects.toThrow();",
        "const { findByRole } = await renderTip(); await expect(findByRole('tooltip')).rejects.toThrow();",
        "import { findByRole } from '@testing-library/dom'; await expect(findByRole('x')).rejects.toThrow();",
        "const view = render(<Tip />); await expect(view.findByTestId('tip', {}, { timeout: 50 })).rejects.toBeDefined();",
        "const { findAllByText } = within(row); await expect(findAllByText('x')).rejects.toThrow();",
        "await expect.soft(screen.findByRole('tooltip')).rejects.toThrow();",
        "const pending = screen.findByRole('tooltip'); await expect(pending).rejects.toThrow();",
        "await expect(within(row).findByRole('tooltip')).rejects.toThrow();",
      ].map((code) => ({
        filename: '/repo/tests/unit/tooltip.test.tsx',
        code,
        errors: [{ messageId: 'negativeTimeoutAssertion' }],
      })),
      ...[
        'await page.waitForTimeout(500);',
        'page.waitForTimeout(500);',
        'await this.page.waitForTimeout(delay);',
        'await frame.waitForTimeout(100);',
      ].map((code) => ({
        filename: '/repo/e2e/flow.spec.ts',
        code,
        errors: [{ messageId: 'playwrightTimeout' }],
      })),
      ...[
        'cy.wait(500);',
        'cy.wait(1);',
        'const pause = 1000; cy.wait(pause);',
        'const pause = 2 * 500; cy.wait(pause);',
        "cy.get('.row').click(); cy.wait(250).then(check);",
      ].map((code) => ({
        filename: '/repo/cypress/e2e/flow.cy.ts',
        code,
        errors: [{ messageId: 'cypressWait' }],
      })),
      {
        filename: '/repo/tests/e2e/flow.spec.ts',
        code: "await page.waitForTimeout(500); await expect(screen.findByRole('tip')).rejects.toThrow();",
        errors: [{ messageId: 'playwrightTimeout' }, { messageId: 'negativeTimeoutAssertion' }],
      },
    ],
  },
);
