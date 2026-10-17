import globals from 'globals';
import { describe, expect, it } from 'vitest';
import tseslint from 'typescript-eslint';
import { rule } from '../eslint-plugin/rules/testing/environment/no-unused-dom-environment.mjs';
import { failureMessagesFor } from '../failure-messages/test-support/harness.mjs';
import { resolveLayout } from '../layout.mjs';
import {
  domProductionConfigFor,
  testEnvironmentConfigFor,
  testEnvironmentsFromVariables,
} from './test-environment-config.mjs';
import { TEST_ENVIRONMENTS_VARIABLE } from './resolve-environment.mjs';

const layout = resolveLayout({ sourceRoots: ['src'], testRoots: ['tests'] }, ['**/generated/**']);
const logic = "it('adds', () => { expect(1 + 1).toBe(2); });";
const directive = ['@vitest', 'environment'].join('-');
const docblock = (name) => `/** ${directive} ${name} */`;
const projectMessage = (environment) =>
  rule.meta.messages.unusedProjectEnvironment
    .replaceAll('{{environment}}', environment)
    .replaceAll('{{directive}}', directive);
const unknown = { environment: undefined, scopes: [] };

function messages(projectEnvironments, filename, code = logic) {
  const config = [
    { languageOptions: { parser: tseslint.parser } },
    ...testEnvironmentConfigFor(layout, projectEnvironments),
  ];
  return failureMessagesFor({ config, filename, code });
}

describe('testEnvironmentConfigFor', () => {
  it('reports pure-logic tests when the project default is a DOM environment', () => {
    const jsdom = { environment: 'jsdom', scopes: [] };
    expect(messages(jsdom, 'src/a.test.ts')).toEqual([projectMessage('jsdom')]);
    expect(messages(jsdom, 'tests/unit/a.spec.ts')).toEqual([projectMessage('jsdom')]);
  });

  it('passes when the project default is node or unknown', () => {
    expect(messages({ environment: 'node', scopes: [] }, 'src/a.test.ts')).toEqual([]);
    expect(messages(unknown, 'src/a.test.ts')).toEqual([]);
  });

  it('reports a directive DOM environment even when the project default is unknown', () => {
    const code = `${docblock('jsdom')}\n${logic}`;
    expect(messages(unknown, 'src/a.test.ts', code)).toEqual([
      rule.meta.messages.unusedDirectiveEnvironment
        .replace('{{environment}}', 'jsdom')
        .replace('{{directive}}', directive),
    ]);
  });

  it('applies project scopes over the default and honours their ignores', () => {
    const environments = {
      environment: 'node',
      scopes: [
        { files: ['src/ui/**/*.test.ts'], ignores: ['src/ui/e2e/**'], environment: 'jsdom' },
      ],
    };
    expect(messages(environments, 'src/ui/a.test.ts')).toEqual([projectMessage('jsdom')]);
    expect(messages(environments, 'src/ui/e2e/a.test.ts')).toEqual([]);
    expect(messages(environments, 'src/core/a.test.ts')).toEqual([]);
  });

  it('lets a DOM project win where several projects match a file', () => {
    const environments = {
      environment: undefined,
      scopes: [
        { files: ['src/**/*.test.ts'], ignores: [], environment: 'node' },
        { files: ['src/ui/**/*.test.ts'], ignores: [], environment: 'jsdom' },
      ],
    };
    expect(messages(environments, 'src/ui/a.test.ts')).toEqual([projectMessage('jsdom')]);
    expect(messages(environments, 'src/core/a.test.ts')).toEqual([]);
  });

  it('applies to runnable test files only, and skips excluded ones', () => {
    const jsdom = { environment: 'jsdom', scopes: [] };
    expect(messages(jsdom, 'tests/helpers.ts')).toEqual([
      'No matching configuration found for tests/helpers.ts.',
    ]);
    expect(messages(jsdom, 'src/generated/a.test.ts')).toEqual([
      'No matching configuration found for src/generated/a.test.ts.',
    ]);
  });
});

describe('testEnvironmentsFromVariables', () => {
  it('reads the environments the parent process resolved', () => {
    const resolved = {
      environment: 'jsdom',
      scopes: [],
      aliases: [{ find: '@', replacement: '/a' }],
    };
    expect(
      testEnvironmentsFromVariables({ [TEST_ENVIRONMENTS_VARIABLE]: JSON.stringify(resolved) }),
    ).toEqual(resolved);
  });

  it('passes bundler aliases into every block and defaults them to none', () => {
    const aliases = [{ find: '@', replacement: '/work/app/src' }];
    const scopes = [{ files: ['src/ui/**/*.test.ts'], ignores: [], environment: 'jsdom' }];
    const blocks = testEnvironmentConfigFor(layout, { environment: 'node', scopes, aliases });
    expect(blocks.map((block) => Object.values(block.rules)[0][1])).toEqual([
      { environment: 'node', aliases, setupFiles: [] },
      { environment: 'jsdom', aliases, setupFiles: [] },
    ]);
    const setupFiles = ['/work/app/setup.ts'];
    const withSetup = testEnvironmentConfigFor(layout, {
      environment: 'jsdom',
      scopes,
      setupFiles,
    });
    expect(withSetup.map((block) => Object.values(block.rules)[0][1].setupFiles)).toEqual([
      setupFiles,
      [],
    ]);
    const resolved = { environment: 'jsdom', scopes: [] };
    expect(
      testEnvironmentsFromVariables({ [TEST_ENVIRONMENTS_VARIABLE]: JSON.stringify(resolved) }),
    ).toEqual({ ...resolved, aliases: [] });
  });

  it('gives the blocks of a DOM environment the browser globals', () => {
    const scopes = [{ files: ['src/ui/**/*.test.ts'], ignores: [], environment: 'happy-dom' }];
    const blocks = testEnvironmentConfigFor(layout, { environment: 'node', scopes });
    expect(blocks.map((block) => block.languageOptions)).toEqual([
      undefined,
      { globals: globals.browser },
    ]);
  });

  it.each([undefined, 'not json', 'null', '{"environment":"jsdom"}'])(
    'treats %s as unknown',
    (value) => {
      expect(testEnvironmentsFromVariables({ [TEST_ENVIRONMENTS_VARIABLE]: value })).toEqual(
        unknown,
      );
    },
  );
});

describe('domProductionConfigFor', () => {
  const javascriptLayout = resolveLayout({ sourceRoots: ['src'], testRoots: ['tests'] }, [], {
    javascript: true,
  });
  const domScope = { files: ['src/ui/**/*.test.js'], ignores: [], environment: 'happy-dom' };

  function productionMessages(projectEnvironments, filename, code) {
    const config = [
      { rules: { 'no-undef': 'error' } },
      ...domProductionConfigFor(javascriptLayout, projectEnvironments),
    ];
    return failureMessagesFor({ config, filename, code });
  }

  it.each([
    { environment: 'jsdom', scopes: [] },
    { environment: 'node', scopes: [domScope] },
  ])('lets the production code of a DOM project use the browser globals', (environments) => {
    expect(productionMessages(environments, 'src/main/render.js', "document.title = 'a';")).toEqual(
      [],
    );
  });

  it('restricts the confusing browser globals outside domain/', () => {
    const jsdom = { environment: 'jsdom', scopes: [] };

    expect(productionMessages(jsdom, 'src/main/render.js', 'export const value = name;')).toEqual([
      "Unexpected use of 'name'. `name` here is the browser global, not a local value. Write `window.name` when you mean the global; otherwise take the value as a parameter (`onClick={(event) => ...}`) or declare it. If this is intentional, add an exception for this rule in nitpicker.config.json.",
    ]);
    expect(
      productionMessages(jsdom, 'src/main/features/a/domain/b.js', 'export const value = name;'),
    ).toEqual([]);
  });

  it.each([unknown, { environment: 'node', scopes: [] }])(
    'leaves the production code of a project without a DOM environment to Node (%j)',
    (environments) => {
      expect(domProductionConfigFor(javascriptLayout, environments)).toEqual([]);
      expect(
        productionMessages(environments, 'src/main/render.js', "document.title = 'a';"),
      ).toEqual(["'document' is not defined."]);
    },
  );
});
