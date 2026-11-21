import type { Rule } from 'eslint';
import cypress from 'eslint-plugin-cypress';
import playwright from 'eslint-plugin-playwright';
import { ruleNamed, withHint, withoutFixes } from '../../typed/rule-views.mts';

type SourceCode = Rule.RuleContext['sourceCode'];
type Hints = Readonly<Record<string, string>>;

const PLAYWRIGHT_MODULE = /^(?:@playwright\/|playwright(?:\/|$))/u;
const CYPRESS_GLOBAL = 'cy';
const RETRYING_ASSERTION = '`await expect(page.getByRole(...)).toBeVisible()`';

const playwrightHints: Hints = {
  'prefer-web-first-assertions': ` It reads the page once, so the assertion fails when the page is still updating. Use the assertion that retries until it passes: ${RETRYING_ASSERTION}, \`await expect(locator).toHaveText('42')\`.`,
  'no-networkidle': ` The page counts as idle after 500 ms without requests, which polling never reaches and a slow render passes too early. Wait for what the test needs instead: ${RETRYING_ASSERTION}.`,
  'no-element-handle': ` An element handle points at one DOM node and goes stale when the page renders again. Use a locator, which finds the element again on every action: \`page.getByRole(...)\`.`,
  'missing-playwright-await': ` Without \`await\`, the test moves on (or ends) before the action or the retrying assertion finishes, so its failure is lost or lands in another test. Await it: \`await expect(locator).toBeVisible()\`.`,
  'no-page-pause': ` \`page.pause()\` stops the test for a debugger. Delete the call, and debug with \`npx playwright test --debug\` instead.`,
};

const cypressHints: Hints = {
  'no-assigning-return-values': `: a command only queues work, so the variable holds a chain and not the element or value. Use the value in \`.then((value) => ...)\` or an alias (\`.as('row')\` and \`cy.get('@row')\`).`,
  'no-async-tests': `: Cypress runs commands from its own queue, so an \`async\` test or hook mixes two orders of execution and can finish before its commands run. Chain the commands without \`async\`.`,
  'no-pause': `: \`cy.pause()\` stops the run for a debugger. Delete the call, and step through the run in the Cypress app instead.`,
};

function importsPlaywright(sourceCode: SourceCode): boolean {
  return sourceCode.ast.body.some(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      typeof statement.source.value === 'string' &&
      PLAYWRIGHT_MODULE.test(statement.source.value),
  );
}

function usesCypress(sourceCode: SourceCode): boolean {
  return (
    sourceCode.scopeManager.globalScope?.through.some(
      (reference) => reference.identifier.name === CYPRESS_GLOBAL,
    ) === true
  );
}

function onlyIn(
  rule: Rule.RuleModule,
  applies: (sourceCode: SourceCode) => boolean,
): Rule.RuleModule {
  return {
    ...rule,
    create(context) {
      return applies(context.sourceCode) ? rule.create(context) : {};
    },
  };
}

function pluginOf(
  upstream: unknown,
  hints: Hints,
  applies: (sourceCode: SourceCode) => boolean,
): { readonly rules: Readonly<Record<string, Rule.RuleModule>> } {
  return {
    rules: Object.fromEntries(
      Object.entries(hints).map(([name, hint]) => [
        name,
        onlyIn(withoutFixes(withHint(ruleNamed(upstream, name), hint)), applies),
      ]),
    ),
  };
}

export const browserTestPlugins = {
  playwright: pluginOf(playwright.rules, playwrightHints, importsPlaywright),
  cypress: pluginOf(cypress.rules, cypressHints, usesCypress),
};

export const browserTestRuleIds = [
  ...Object.keys(playwrightHints).map((name) => `playwright/${name}`),
  ...Object.keys(cypressHints).map((name) => `cypress/${name}`),
];
