import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const INVENTORY_FILE = new URL('./eslint-inventory.json', import.meta.url);
const INVENTORY_OUTPUT = 'inventory.json';
const ENVIRONMENT_FILE = 'eslint.env';
const POLICY_FILE = 'policy.json';
const CORE_PLUGIN = '@';
const POLICIES = new URL('../preset/eslint-config/policies/', import.meta.url);

export const ESLINT_CONFIGS = [
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

/** The projects the inventory reads the configs for: what the analyzed project holds, and the files it asks about. */
export const ESLINT_VARIANTS = {
  typescript: {
    files: TYPESCRIPT_SAMPLES,
    project: {
      'package.json': JSON.stringify({}),
      [POLICY_FILE]: JSON.stringify({ react: { enabled: false }, i18n: { enabled: false } }),
    },
  },
  'typescript-react': {
    files: TYPESCRIPT_SAMPLES,
    project: {
      'package.json': JSON.stringify(FULL_MANIFEST),
      'vitest.config.ts': VITEST_CONFIG,
      [POLICY_FILE]: JSON.stringify({ react: { enabled: true }, i18n: { enabled: true } }),
    },
  },
  javascript: {
    files: JAVASCRIPT_SAMPLES,
    project: {
      'package.json': JSON.stringify(FULL_MANIFEST),
      [POLICY_FILE]: JSON.stringify({ preset: 'javascript' }),
    },
  },
};

function isActive(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  return severity !== 'off' && severity !== 0;
}

function optionObjects(option) {
  if (Array.isArray(option)) {
    return option;
  }
  return option !== null && typeof option === 'object' ? [option] : [];
}

function formsOf(id, options) {
  const entries = options.flatMap(optionObjects);
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

function ruleOf(plugins, id) {
  const slash = id.lastIndexOf('/');
  return slash === -1
    ? plugins.get(CORE_PLUGIN)?.rules?.[id]
    : plugins.get(id.slice(0, slash))?.rules?.[id.slice(slash + 1)];
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

async function activeRules({ ESLint, cwd, files }, [tool, config]) {
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: config });
  const configs = await Promise.all(files.map((file) => eslint.calculateConfigForFile(file)));
  return configs.flatMap((calculated) =>
    Object.entries(calculated?.rules ?? {})
      .filter(([, setting]) => isActive(setting))
      .map(([id, setting]) => ({
        id,
        tool,
        plugins: calculated.plugins ?? {},
        forms: formsOf(id, Array.isArray(setting) ? setting.slice(1) : []),
      })),
  );
}

/**
 * The ESLint rules that `configs` (each `[tool, flat config]`, loaded for one variant's project) turn on
 * for the variant's files: `{ [ruleId]: { tools, forms, description, url, messages } }`.
 */
export async function inventoryOfConfigs({ configs, cwd, files }) {
  const { ESLint } = await import('eslint');
  const active = (
    await Promise.all(configs.map((config) => activeRules({ ESLint, cwd, files }, config)))
  ).flat();
  const plugins = new Map(active.flatMap(({ plugins: found }) => Object.entries(found)));
  const ids = [...new Set(active.map(({ id }) => id))].sort();
  return Object.fromEntries(
    ids.map((id) => {
      const own = active.filter((rule) => rule.id === id);
      return [
        id,
        {
          tools: [...new Set(own.map(({ tool }) => tool))],
          forms: unionForms(own.flatMap(({ forms }) => forms)),
          ...metaOf(ruleOf(plugins, id)),
        },
      ];
    }),
  );
}

/** A temporary project with the files of `variant`; the caller removes it. */
export function variantProject(variant) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-rule-reference-'));
  for (const [name, text] of Object.entries(ESLINT_VARIANTS[variant].project)) {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) {
      throw new Error(`The project file ${name} is outside the project`);
    }
    writeFileSync(file, text);
  }
  return root;
}

/** The environment the ESLint configs read the analyzed project from. */
export function variantEnvironment(root) {
  return {
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    NITPICKER_POLICY: path.join(root, POLICY_FILE),
  };
}

function environmentFileText(root) {
  return Object.entries(variantEnvironment(root))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}\n`)
    .join('');
}

async function liveInventoryOf(variant) {
  const root = variantProject(variant);
  try {
    const environmentFile = path.join(root, ENVIRONMENT_FILE);
    writeFileSync(environmentFile, environmentFileText(root));
    await run(
      process.execPath,
      [`--env-file=${environmentFile}`, fileURLToPath(import.meta.url), variant, root],
      { cwd: root },
    );
    return JSON.parse(readFileSync(path.join(root, INVENTORY_OUTPUT), 'utf8'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** The ESLint rules the presets enable, read from the configs one process per variant: `{ [variant]: inventory }`. */
export async function liveEslintInventory() {
  const names = Object.keys(ESLINT_VARIANTS);
  const inventories = await Promise.all(names.map(liveInventoryOf));
  return Object.fromEntries(names.map((name, index) => [name, inventories[index]]));
}

/** The committed ESLint inventory that the reference is built from. */
export function readEslintInventory() {
  return JSON.parse(readFileSync(INVENTORY_FILE, 'utf8'));
}

/** Rewrites the committed ESLint inventory as `text`. */
export function writeEslintInventory(text) {
  writeFileSync(INVENTORY_FILE, text);
}

/** The path of the committed ESLint inventory, relative to `repositoryRoot`. */
export function eslintInventoryPath(repositoryRoot) {
  return path.relative(repositoryRoot, fileURLToPath(INVENTORY_FILE));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [variant, root] = process.argv.slice(2);
  const configs = await Promise.all(
    ESLINT_CONFIGS.map(async ([tool, url]) => [tool, (await import(url.href)).default]),
  );
  const inventory = await inventoryOfConfigs({
    configs,
    cwd: root,
    files: ESLINT_VARIANTS[variant].files,
  });
  writeFileSync(path.join(root, INVENTORY_OUTPUT), JSON.stringify(inventory));
}
