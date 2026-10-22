import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const POLICIES = new URL('../preset/eslint-config/policies/', import.meta.url);
const CONFIGS = [
  ['eslint-lint', new URL('../preset/defaults/eslint.config.mjs', import.meta.url)],
  ['eslint-errors', new URL('errors.config.mjs', POLICIES)],
  ['eslint-logging', new URL('logging.config.mjs', POLICIES)],
  ['eslint-module-effects', new URL('module-effects.config.mjs', POLICIES)],
  ['coding-standards', new URL('coding-standards.config.mjs', POLICIES)],
];
const REACT_PACKAGES = { react: '^19.0.0', 'react-dom': '^19.0.0', 'react-intl': '^7.0.0' };
const FULL_MANIFEST = {
  dependencies: { ...REACT_PACKAGES, next: '^15.0.0', express: '^5.0.0' },
  devDependencies: { '@testing-library/react': '^16.0.0', vitest: '^3.0.0' },
};
const VITEST_CONFIG =
  "export default { test: { globals: true, setupFiles: ['test/setup.ts'] } };\n";
const VARIANTS = {
  typescript: {
    language: 'typescript',
    manifest: {},
    policy: { react: { enabled: false }, i18n: { enabled: false } },
  },
  'typescript-react': {
    language: 'typescript',
    manifest: FULL_MANIFEST,
    projectFiles: { 'vitest.config.ts': VITEST_CONFIG },
    policy: { react: { enabled: true }, i18n: { enabled: true } },
  },
  javascript: {
    language: 'javascript',
    manifest: FULL_MANIFEST,
    policy: { preset: 'javascript' },
  },
};
const MAXIMUM_OUTPUT = 64 * 1024 * 1024;

function isActive(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  return severity !== 'off' && severity !== 0;
}

function formsOf(id, options) {
  const entries = options.flatMap((option) =>
    Array.isArray(option) ? option : option && typeof option === 'object' ? [option] : [],
  );
  if (id === 'vitest/no-restricted-matchers') {
    return entries.flatMap((option) =>
      Object.entries(option).map(([name, message]) => ({ label: name, message })),
    );
  }
  return entries
    .filter(({ message }) => typeof message === 'string')
    .map(({ message, name, object, property }) => ({
      message,
      ...(name === undefined ? {} : { label: name }),
      ...(object === undefined ? {} : { label: `${object}.${property}` }),
    }));
}

function unionForms(forms) {
  const seen = new Map(forms.map((form) => [`${form.label ?? ''}\0${form.message}`, form]));
  return [...seen.values()];
}

function pluginRule(plugins, id) {
  const slash = id.lastIndexOf('/');
  const prefix = slash === -1 ? undefined : id.slice(0, slash);
  return slash === -1 ? undefined : plugins.get(prefix)?.rules?.[id.slice(slash + 1)];
}

function metaOf(rule) {
  const meta = rule?.meta;
  return {
    ...(meta?.docs?.description === undefined ? {} : { description: meta.docs.description }),
    ...(meta?.docs?.url === undefined ? {} : { url: meta.docs.url }),
    ...(meta?.messages === undefined ? {} : { messages: Object.values(meta.messages) }),
    ...(meta?.deprecated === true ? { deprecated: true } : {}),
  };
}

const TYPESCRIPT_SAMPLES = [
  'src/main/app.ts',
  'src/main/ui/panel.tsx',
  'src/main/app.config.ts',
  'src/main/features/x/index.ts',
  'src/main/features/x/domain/rule.ts',
  'src/main/features/x/adapters/store.ts',
  'src/main/features/x/adapters/panel.tsx',
  'src/test/app.test.ts',
  'src/test/ui/panel.test.tsx',
  'src/test/features/x/domain/rule.test.ts',
  'test/unit/app.test.ts',
  'test/support/helper.ts',
  'test/setup.ts',
  'e2e/flow.spec.ts',
];
const JAVASCRIPT_SAMPLES = [
  'src/main/app.js',
  'src/main/app.config.js',
  'src/main/features/x/index.js',
  'src/main/features/x/domain/rule.js',
  'src/main/features/x/adapters/store.js',
  'src/test/app.test.js',
  'test/support/helper.js',
  'e2e/flow.spec.js',
];

async function activeRules(ESLint, [tool, url], files) {
  const eslint = new ESLint({ cwd: process.cwd(), overrideConfigFile: fileURLToPath(url) });
  const configs = await Promise.all(files.map((file) => eslint.calculateConfigForFile(file)));
  return configs.flatMap((config) =>
    Object.entries(config?.rules ?? {})
      .filter(([, setting]) => isActive(setting))
      .map(([id, setting]) => ({
        id,
        tool,
        plugins: config.plugins ?? {},
        forms: formsOf(id, Array.isArray(setting) ? setting.slice(1) : []),
      })),
  );
}

async function collect() {
  const { ESLint } = await import('eslint');
  const { builtinRules } = await import('eslint/use-at-your-own-risk');
  const files =
    process.env.NITPICKER_REFERENCE_FILES === 'javascript'
      ? JAVASCRIPT_SAMPLES
      : TYPESCRIPT_SAMPLES;
  const active = (
    await Promise.all(CONFIGS.map((config) => activeRules(ESLint, config, files)))
  ).flat();
  const plugins = new Map(active.flatMap(({ plugins: found }) => Object.entries(found)));
  const ids = [...new Set(active.map(({ id }) => id))];
  return Object.fromEntries(
    ids.map((id) => {
      const own = active.filter((rule) => rule.id === id);
      return [
        id,
        {
          tools: [...new Set(own.map(({ tool }) => tool))],
          forms: unionForms(own.flatMap(({ forms }) => forms)),
          ...metaOf(id.includes('/') ? pluginRule(plugins, id) : builtinRules.get(id)),
        },
      ];
    }),
  );
}

function projectWith({ manifest, policy, projectFiles = {} }) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-rule-reference-'));
  mkdirSync(path.join(root, 'src'));
  for (const [file, text] of Object.entries(projectFiles)) {
    writeFileSync(path.join(root, file), text);
  }
  writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  writeFileSync(path.join(root, 'policy.json'), JSON.stringify(policy));
  return root;
}

async function inventoryOf(variant) {
  const root = projectWith(VARIANTS[variant]);
  try {
    const { stdout } = await run(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: root,
      maxBuffer: MAXIMUM_OUTPUT,
      env: {
        ...process.env,
        NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
        NITPICKER_REFERENCE_FILES: VARIANTS[variant].language,
        NITPICKER_POLICY: path.join(root, 'policy.json'),
      },
    });
    return JSON.parse(stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The ESLint rules the presets enable, read from the real configs: `{ [variant]: { [ruleId]: facts } }`. */
export async function eslintInventory() {
  const names = Object.keys(VARIANTS);
  const inventories = await Promise.all(names.map(inventoryOf));
  return Object.fromEntries(names.map((name, index) => [name, inventories[index]]));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify(await collect()));
}
