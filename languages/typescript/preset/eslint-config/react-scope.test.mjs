import { ESLint } from 'eslint';
import accessibility from 'eslint-plugin-jsx-a11y-x';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveLayout } from '../layout.mjs';
import {
  accessibilityRuleNames,
  reactRuleIds,
  reactTestRuleIds,
  testingLibraryHints,
} from './react-rules.mjs';
import {
  analyzedProjectRoot,
  isReactProject,
  reactScopeConfigFor,
  reactSyntaxConfigFor,
  reactTypedConfigFor,
} from './react-scope.mjs';

const layout = resolveLayout();
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-react-scope-'));
  temporaryRoots.push(root);
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'package.json'), manifest);
  }
  return root;
}

function manifestWith(fields) {
  return JSON.stringify({ name: 'app', ...fields });
}

describe('React detection', () => {
  it.each([
    ['dependencies', { dependencies: { react: '19.0.0' } }],
    ['devDependencies', { devDependencies: { react: '19.0.0' } }],
    ['both', { dependencies: { react: '19.0.0' }, devDependencies: { react: '19.0.0' } }],
  ])('turns on when react is in %s', (_name, fields) => {
    const projectRoot = projectWith(manifestWith(fields));

    expect(isReactProject({ projectRoot })).toBe(true);
  });

  it.each([
    ['no manifest', undefined],
    ['a manifest without dependencies', manifestWith({})],
    ['other dependencies only', manifestWith({ dependencies: { preact: '10.0.0' } })],
    ['react only as a peer dependency', manifestWith({ peerDependencies: { react: '19.0.0' } })],
    ['react-dom without react', manifestWith({ dependencies: { 'react-dom': '19.0.0' } })],
    ['a malformed manifest', '{ not json'],
    ['a manifest that is JSON null', 'null'],
    ['a manifest that is a JSON number', '5'],
  ])('stays off with %s', (_name, manifest) => {
    const projectRoot = projectWith(manifest);

    expect(isReactProject({ projectRoot })).toBe(false);
  });

  it('lets the config switch the scope on or off whatever package.json says', () => {
    const withReact = projectWith(manifestWith({ dependencies: { react: '19.0.0' } }));
    const withoutReact = projectWith(manifestWith({}));

    expect(isReactProject({ projectRoot: withReact, react: { enabled: false } })).toBe(false);
    expect(isReactProject({ projectRoot: withoutReact, react: { enabled: true } })).toBe(true);
    expect(isReactProject({ projectRoot: withReact, react: { styling: 'css-in-js' } })).toBe(true);
    expect(isReactProject({ projectRoot: withoutReact, react: {} })).toBe(false);
  });

  it('reads the analyzed project from the ESLint wrapper environment, else the working directory', () => {
    expect(analyzedProjectRoot({ NITPICKER_DIFF_ESLINT_PROJECT_ROOT: '/analyzed' })).toBe(
      '/analyzed',
    );
    expect(analyzedProjectRoot({})).toBe(process.cwd());
  });

  it('does not treat this repository as a React project', () => {
    expect(isReactProject({ projectRoot: path.resolve(import.meta.dirname, '../../../..') })).toBe(
      false,
    );
  });
});

async function calculatedConfig(entries, file) {
  const eslint = new ESLint({
    cwd: path.resolve(import.meta.dirname, '../defaults'),
    overrideConfigFile: true,
    overrideConfig: [{ languageOptions: { parser: tseslint.parser } }, ...entries],
  });
  return eslint.calculateConfigForFile(file);
}

describe('the React scope config', () => {
  it('configures exactly the listed React rule ids', async () => {
    const [production, tests] = await reactSyntaxConfigFor(layout);

    expect(Object.keys(production.rules).toSorted()).toEqual(reactRuleIds.toSorted());
    expect(Object.keys(tests.rules).toSorted()).toEqual(reactTestRuleIds.toSorted());
  });

  it('registers an implementation for every plugin rule it configures', async () => {
    for (const entry of await reactSyntaxConfigFor(layout)) {
      for (const id of Object.keys(entry.rules)) {
        const [pluginName, ...rest] = id.split('/');
        expect(entry.plugins[pluginName].rules[rest.join('/')], id).toBeDefined();
      }
    }
  });

  it('runs every rule as an error', async () => {
    for (const entry of await reactSyntaxConfigFor(layout)) {
      for (const [id, setting] of Object.entries(entry.rules)) {
        expect([setting].flat()[0], id).toBe('error');
      }
    }
  });

  it('gives every Testing Library rule a hint naming the allowed form', async () => {
    const { testingLibraryPlugin } = await import('./react-plugins.mjs');

    expect(Object.keys(testingLibraryPlugin.rules).toSorted()).toEqual(
      Object.keys(testingLibraryHints).toSorted(),
    );
    for (const [name, hint] of Object.entries(testingLibraryHints)) {
      const messages = Object.values(testingLibraryPlugin.rules[name].meta.messages);
      expect(messages.length, name).toBeGreaterThan(0);
      for (const message of messages) {
        expect(message.endsWith(hint), name).toBe(true);
      }
    }
  });

  it('lists the accessibility rules the plugin recommends, and only those', () => {
    const recommended = Object.entries(accessibility.configs.recommended.rules)
      .filter(([, setting]) => [setting].flat()[0] !== 'off')
      .map(([id]) => id.replace('jsx-a11y-x/', ''));

    expect(accessibilityRuleNames.toSorted()).toEqual(recommended.toSorted());
  });

  it('defaults to class names and passes the configured styling approach to the rule', async () => {
    const [fallback] = await reactSyntaxConfigFor(layout);
    const [configured] = await reactSyntaxConfigFor(layout, { styling: 'inline-style' });
    const [explicit] = await reactSyntaxConfigFor(layout, { enabled: true });

    expect(fallback.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'class-names' },
    ]);
    expect(explicit.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'class-names' },
    ]);
    expect(configured.rules['nitpicker/react-single-styling-approach']).toEqual([
      'error',
      { approach: 'inline-style' },
    ]);
  });

  it('keeps the accessibility rule options of the plugin', async () => {
    const [entry] = await reactSyntaxConfigFor(layout);

    expect(entry.rules['jsx-a11y/alt-text']).toEqual(['error']);
    expect(entry.rules['jsx-a11y/no-noninteractive-tabindex']).toEqual([
      'error',
      { tags: [], roles: ['tabpanel'], allowExpressionValues: true },
    ]);
  });

  it('applies to production source only, not to tests', async () => {
    const entries = await reactScopeConfigFor(layout);

    for (const file of ['src/ui/panel.tsx', 'src/hooks/use-panel.ts']) {
      const config = await calculatedConfig(entries, file);
      expect(config.rules['react-hooks/rules-of-hooks'], file).toBeDefined();
    }
    for (const file of ['src/ui/panel.test.tsx', 'test/panel.tsx', 'src/ui/__tests__/panel.tsx']) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['react-hooks/rules-of-hooks'], file).toBeUndefined();
    }
  });

  it('applies the test rules to test files only, not to production source', async () => {
    const entries = await reactScopeConfigFor(layout);

    for (const file of [
      'src/ui/panel.test.tsx',
      'src/ui/panel.spec.jsx',
      'test/panel.tsx',
      'tests/ui/panel.tsx',
      'src/ui/__tests__/panel.tsx',
    ]) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['testing-library/no-test-id-queries'], file).toBeDefined();
      expect(config.rules['nitpicker/react-test-no-implementation-details'], file).toBeDefined();
    }
    for (const file of ['src/ui/panel.tsx', 'src/hooks/use-panel.ts']) {
      const config = await calculatedConfig(entries, file);
      expect(config.rules['testing-library/no-test-id-queries'], file).toBeUndefined();
      expect(config.rules['nitpicker/react-test-no-implementation-details'], file).toBeUndefined();
    }
  });

  it('follows a custom layout', async () => {
    const entries = await reactScopeConfigFor(resolveLayout({ sourceRoots: ['lib'] }));

    expect((await calculatedConfig(entries, 'lib/panel.tsx')).rules).toHaveProperty(
      'react-hooks/rules-of-hooks',
    );
    expect((await calculatedConfig(entries, 'src/panel.tsx'))?.rules ?? {}).not.toHaveProperty(
      'react-hooks/rules-of-hooks',
    );
  });

  it('follows a custom test root', async () => {
    const entries = await reactScopeConfigFor(resolveLayout({ testRoots: ['spec'] }));

    expect((await calculatedConfig(entries, 'spec/panel.tsx')).rules).toHaveProperty(
      'testing-library/no-test-id-queries',
    );
    expect((await calculatedConfig(entries, 'test/panel.tsx'))?.rules ?? {}).not.toHaveProperty(
      'testing-library/no-test-id-queries',
    );
  });

  it('lets event handler attributes be async', () => {
    const [entry] = reactTypedConfigFor(layout);

    expect(entry.rules).toEqual({
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    });
    expect(entry.files).toEqual(layout.sourceGlobs);
    expect(entry.ignores).toEqual([...layout.testGlobs, ...layout.sourceTestDirectoryGlobs]);
  });

  it('combines the syntax and the typed entries', async () => {
    const entries = await reactScopeConfigFor(layout);

    expect(entries).toHaveLength(3);
    expect(entries.slice(0, 2)).toEqual(await reactSyntaxConfigFor(layout));
    expect(entries[2]).toEqual(reactTypedConfigFor(layout)[0]);
  });
});
