import { ESLint } from 'eslint';
import formatjs from 'eslint-plugin-formatjs';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import tseslint from 'typescript-eslint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POLICY_FILES } from '../../checks/policy-files.mjs';
import { resolveHeadPolicy } from '../../head-policy.mjs';
import { resolveLayout } from '../../layout.mjs';
import { isStrictRule, strictEslintRuleIds } from '../../strict-rules.mjs';
import { i18nOffRules, i18nRuleIds, i18nRuleNames, i18nRules } from './i18n-rules.mjs';
import { i18nScopeConfigFor, isI18nProject } from './i18n-scope.mjs';

const layout = resolveLayout();
const presetConfigUrl = pathToFileURL(
  path.join(import.meta.dirname, '../../defaults/eslint.config.mjs'),
);
const temporaryRoots = [];
let importCount = 0;

afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(manifest) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-i18n-scope-'));
  temporaryRoots.push(root);
  if (manifest !== undefined) {
    writeFileSync(path.join(root, 'package.json'), manifest);
  }
  return root;
}

function manifestWith(fields) {
  return JSON.stringify({ name: 'app', ...fields });
}

describe('i18n detection', () => {
  it.each([
    ['react-intl in dependencies', { dependencies: { 'react-intl': '7.0.0' } }],
    ['react-intl in devDependencies', { devDependencies: { 'react-intl': '7.0.0' } }],
    ['@formatjs/intl in dependencies', { dependencies: { '@formatjs/intl': '3.0.0' } }],
    ['@formatjs/intl in devDependencies', { devDependencies: { '@formatjs/intl': '3.0.0' } }],
  ])('turns on with %s', (_name, fields) => {
    expect(isI18nProject({ projectRoot: projectWith(manifestWith(fields)) })).toBe(true);
  });

  it.each([
    ['no manifest', undefined],
    ['a manifest without dependencies', manifestWith({})],
    ['react without an i18n library', manifestWith({ dependencies: { react: '19.0.0' } })],
    ['another i18n library', manifestWith({ dependencies: { i18next: '25.0.0' } })],
    [
      'react-intl only as a peer dependency',
      manifestWith({ peerDependencies: { 'react-intl': '7' } }),
    ],
    ['a similarly named package', manifestWith({ dependencies: { 'react-intl-extra': '1.0.0' } })],
    ['a malformed manifest', '{ not json'],
  ])('stays off with %s', (_name, manifest) => {
    expect(isI18nProject({ projectRoot: projectWith(manifest) })).toBe(false);
  });

  it('lets the config switch the scope on or off whatever package.json says', () => {
    const withIntl = projectWith(manifestWith({ dependencies: { 'react-intl': '7.0.0' } }));
    const withoutIntl = projectWith(manifestWith({}));

    expect(isI18nProject({ projectRoot: withIntl, i18n: { enabled: false } })).toBe(false);
    expect(isI18nProject({ projectRoot: withoutIntl, i18n: { enabled: true } })).toBe(true);
    expect(isI18nProject({ projectRoot: withIntl, i18n: {} })).toBe(true);
    expect(isI18nProject({ projectRoot: withoutIntl, i18n: {} })).toBe(false);
  });
});

describe('the scope decision in the head policy', () => {
  it('is made once from the head checkout, whichever tree a run lints', () => {
    const withIntl = projectWith(manifestWith({ dependencies: { 'react-intl': '7.0.0' } }));
    const without = projectWith(manifestWith({ dependencies: { react: '19.0.0' } }));

    const [intl, react] = [resolveHeadPolicy({}, withIntl), resolveHeadPolicy({}, without)];

    expect([intl.i18n, intl.react]).toEqual([{ enabled: true }, { enabled: false }]);
    expect([react.i18n, react.react]).toEqual([
      { enabled: false },
      { enabled: true, major: 19, styling: 'class-names', autoCleanup: true },
    ]);
  });

  it('keeps what the config sets, and the other settings of the key', () => {
    const withIntl = projectWith(manifestWith({ dependencies: { 'react-intl': '7.0.0' } }));
    const policy = resolveHeadPolicy(
      { i18n: { enabled: false, functionNames: ['translate'] }, react: { styling: 'css-in-js' } },
      withIntl,
    );

    expect(policy.i18n).toEqual({ enabled: false, functionNames: ['translate'] });
    expect(policy.react).toEqual({ styling: 'css-in-js', enabled: false });
  });

  it('leaves the policy alone without a project root or for another preset', () => {
    const withIntl = projectWith(manifestWith({ dependencies: { 'react-intl': '7.0.0' } }));

    expect(resolveHeadPolicy({})).not.toHaveProperty('i18n');
    expect(resolveHeadPolicy({ preset: 'python' }, withIntl)).not.toHaveProperty('i18n');
  });
});

describe('the rule decisions', () => {
  it('classifies every rule of the installed plugin as on or off, once', () => {
    const classified = [...i18nRuleNames, ...i18nOffRules];

    expect(classified.toSorted()).toEqual(Object.keys(formatjs.rules).toSorted());
    expect(new Set(classified).size).toBe(classified.length);
  });

  it('writes the literal form for the default message and the description', () => {
    expect(i18nRules['enforce-default-message'].setting).toEqual(['error', 'literal']);
    expect(i18nRules['enforce-description'].setting).toEqual(['error', 'literal']);
  });

  it('holds every enabled rule to the strict gate without listing it among the always-on rules', () => {
    for (const id of i18nRuleIds) {
      expect(isStrictRule(id), id).toBe(true);
      expect(strictEslintRuleIds, id).not.toContain(id);
    }
    for (const name of i18nOffRules) {
      expect(isStrictRule(`formatjs/${name}`), name).toBe(false);
    }
  });

  it('runs every rule as an error', () => {
    for (const [name, { setting }] of Object.entries(i18nRules)) {
      expect([setting].flat()[0], name).toBe('error');
    }
  });
});

async function calculatedConfig(entries, file) {
  const eslint = new ESLint({
    cwd: path.resolve(import.meta.dirname, '../../defaults'),
    overrideConfigFile: true,
    overrideConfig: [{ languageOptions: { parser: tseslint.parser } }, ...entries],
  });
  return eslint.calculateConfigForFile(file);
}

describe('the i18n scope config', () => {
  it('configures exactly the listed rule ids and implements each one', async () => {
    const [entry] = await i18nScopeConfigFor(layout);

    expect(Object.keys(entry.rules).toSorted()).toEqual(i18nRuleIds.toSorted());
    expect(Object.keys(entry.plugins.formatjs.rules).toSorted()).toEqual(i18nRuleNames.toSorted());
  });

  it('applies to production source only, not to tests', async () => {
    const entries = await i18nScopeConfigFor(layout);

    for (const file of ['src/ui/panel.tsx', 'src/ui/messages.ts']) {
      const config = await calculatedConfig(entries, file);
      expect(config.rules['formatjs/enforce-description'], file).toBeDefined();
    }
    for (const file of ['src/ui/panel.test.tsx', 'test/panel.tsx', 'src/ui/__tests__/panel.tsx']) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['formatjs/enforce-description'], file).toBeUndefined();
    }
  });

  it('skips story files, which hold literal arguments on purpose', async () => {
    const entries = await i18nScopeConfigFor(layout);

    for (const file of ['src/ui/panel.stories.tsx', 'src/ui/panel.story.jsx']) {
      const config = await calculatedConfig(entries, file);
      expect(config?.rules?.['formatjs/enforce-description'], file).toBeUndefined();
    }
  });

  it('hands the wrapper names to the plugin as settings, and nothing when unset', async () => {
    const [plain] = await i18nScopeConfigFor(layout);
    const [named] = await i18nScopeConfigFor(layout, {
      functionNames: ['translate'],
      componentNames: ['Text'],
    });

    expect(plain.settings).toEqual({ formatjs: {} });
    expect(named.settings).toEqual({
      formatjs: { additionalFunctionNames: ['translate'], additionalComponentNames: ['Text'] },
    });
  });

  it('hashes the scope files it runs', () => {
    const folder = path.join(import.meta.dirname);
    const sources = readdirSync(folder)
      .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
      .map((name) => `languages/typescript/preset/eslint-config/i18n/${name}`);
    const repositoryRoot = path.resolve(import.meta.dirname, '../../../../..');

    for (const file of [
      ...sources,
      'languages/typescript/preset/eslint-config/scope-support.mjs',
    ]) {
      expect(POLICY_FILES, file).toContain(file);
      expect(existsSync(path.join(repositoryRoot, file)), file).toBe(true);
    }
  });

  it('follows a custom layout', async () => {
    const entries = await i18nScopeConfigFor(resolveLayout({ sourceRoots: ['lib'] }));

    expect((await calculatedConfig(entries, 'lib/panel.tsx')).rules).toHaveProperty(
      'formatjs/enforce-description',
    );
    expect((await calculatedConfig(entries, 'src/panel.tsx'))?.rules ?? {}).not.toHaveProperty(
      'formatjs/enforce-description',
    );
  });
});

async function presetConfigFor({ manifest, policy }) {
  const root = projectWith(JSON.stringify(manifest));
  vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', root);
  if (policy !== undefined) {
    const policyFile = path.join(root, 'policy.json');
    writeFileSync(policyFile, JSON.stringify(policy));
    vi.stubEnv('NITPICKER_POLICY', policyFile);
  }
  importCount += 1;
  const module = await import(`${presetConfigUrl.href}?i18n=${String(importCount)}`);
  return module.default;
}

function ruleIdsOf(config) {
  return new Set(config.flatMap((entry) => Object.keys(entry.rules ?? {})));
}

const intlManifest = { dependencies: { 'react-intl': '7.0.0' } };

describe('the preset config', () => {
  it('has no i18n rule or plugin in a project without react-intl', async () => {
    const config = await presetConfigFor({ manifest: { dependencies: { react: '19.0.0' } } });

    expect([...ruleIdsOf(config)].filter((id) => id.startsWith('formatjs/'))).toEqual([]);
    expect(config.some((entry) => entry.plugins?.formatjs !== undefined)).toBe(false);
  });

  it('turns the i18n scope on when package.json lists react-intl', async () => {
    const config = await presetConfigFor({ manifest: intlManifest });

    for (const id of i18nRuleIds) {
      expect(ruleIdsOf(config).has(id), id).toBe(true);
    }
  });

  it('follows the config override over package.json in both directions', async () => {
    const off = await presetConfigFor({
      manifest: intlManifest,
      policy: { i18n: { enabled: false } },
    });
    const on = await presetConfigFor({ manifest: {}, policy: { i18n: { enabled: true } } });

    expect(ruleIdsOf(off).has('formatjs/enforce-description')).toBe(false);
    expect(ruleIdsOf(on).has('formatjs/enforce-description')).toBe(true);
  });

  it('keeps the i18n scope independent of the React scope', async () => {
    const config = await presetConfigFor({ manifest: intlManifest });

    expect(ruleIdsOf(config).has('react-hooks/rules-of-hooks')).toBe(false);
    expect(ruleIdsOf(config).has('formatjs/enforce-description')).toBe(true);
  });

  it('lifts an i18n rule only for the configured paths', async () => {
    const config = await presetConfigFor({
      manifest: intlManifest,
      policy: {
        exceptions: [
          {
            rule: 'formatjs/no-literal-string-in-jsx',
            paths: ['src/legacy/**'],
            reason: 'Screens not translated yet',
          },
        ],
      },
    });
    const eslint = new ESLint({
      cwd: path.resolve(import.meta.dirname, '../../defaults'),
      overrideConfigFile: true,
      overrideConfig: config,
    });

    const legacy = await eslint.calculateConfigForFile('src/legacy/panel.tsx');
    const fresh = await eslint.calculateConfigForFile('src/fresh/panel.tsx');

    expect(legacy.rules['formatjs/no-literal-string-in-jsx'][0]).toBe(0);
    expect(fresh.rules['formatjs/no-literal-string-in-jsx'][0]).toBe(2);
  });

  it('skips an exception that names an i18n rule when the scope is off', async () => {
    const config = await presetConfigFor({
      manifest: {},
      policy: {
        exceptions: [
          { rule: 'formatjs/enforce-description', paths: ['src/**'], reason: 'Not translated' },
        ],
      },
    });

    expect(ruleIdsOf(config).has('formatjs/enforce-description')).toBe(false);
  });

  it('still rejects an exception that names an unknown or switched-off i18n rule', async () => {
    for (const rule of ['formatjs/enforce-descripton', 'formatjs/no-emoji']) {
      await expect(
        presetConfigFor({
          manifest: intlManifest,
          policy: { exceptions: [{ rule, paths: ['src/**'], reason: 'Typo' }] },
        }),
      ).rejects.toThrow(`unknown rules: ${rule}`);
    }
  });
});
