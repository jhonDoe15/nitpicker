import { execFile } from 'node:child_process';
import type { Linter } from 'eslint';
import { mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Environment } from '../../../shared/processes/environment.mts';
import { TOOL_TIMEOUT_MS } from '../../../shared/processes/deadlines.mjs';
import { fieldOf } from '../../../shared/values/readers.mts';
import {
  inventoryOf,
  variantInventoryOf,
  type EslintInventory,
  type VariantInventory,
} from './typed/inventory-types.mts';
import {
  activeRules,
  metaOf,
  ruleOf,
  unionForms,
  type ConfigEntry,
} from './typed/active-rules.mts';

const run = promisify(execFile);
const INVENTORY_FILE = new URL('./eslint-inventory.json', import.meta.url);
const INVENTORY_OUTPUT = 'inventory.json';
const POLICY_FILE = 'policy.json';
const POLICIES = new URL('../preset/eslint-config/policies/', import.meta.url);

type ProjectVariant = {
  readonly files: readonly string[];
  readonly project: Readonly<Record<string, string>>;
};

export const ESLINT_CONFIGS: readonly (readonly [string, URL])[] = [
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

export const ESLINT_VARIANTS: Readonly<Record<string, ProjectVariant>> = {
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

function isConfig(value: unknown): value is Linter.Config {
  return typeof value === 'object' && value !== null;
}

export function configOfModule(loaded: unknown): Linter.Config {
  const config = fieldOf(loaded, 'default');
  if (!isConfig(config)) {
    throw new Error('The ESLint config module has no default export');
  }
  return config;
}

export function variantOf(variant: string): ProjectVariant {
  const found = ESLINT_VARIANTS[variant];
  if (found === undefined) {
    throw new Error(`Unknown ESLint inventory variant ${variant}`);
  }
  return found;
}

export async function inventoryOfConfigs({
  configs,
  cwd,
  files,
}: {
  configs: readonly ConfigEntry[];
  cwd: string;
  files: readonly string[];
}): Promise<VariantInventory> {
  const { ESLint: eslintClass } = await import('eslint');
  const active = (
    await Promise.all(
      configs.map((config) => activeRules({ ESLint: eslintClass, cwd, files }, config)),
    )
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

export function variantProject(variant: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-rule-reference-'));
  for (const [name, text] of Object.entries(variantOf(variant).project)) {
    const file = path.resolve(root, name);
    if (!file.startsWith(root + path.sep)) {
      throw new Error(`The project file ${name} is outside the project`);
    }
    writeFileSync(file, text);
  }
  return root;
}

export function variantEnvironment(root: string): Environment {
  return {
    NITPICKER_DIFF_ESLINT_PROJECT_ROOT: root,
    NITPICKER_POLICY: path.join(root, POLICY_FILE),
  };
}

async function liveInventoryOf(variant: string): Promise<VariantInventory> {
  const root = variantProject(variant);
  try {
    await run(process.execPath, [fileURLToPath(import.meta.url), variant, root], {
      cwd: root,
      env: variantEnvironment(root),
      timeout: TOOL_TIMEOUT_MS,
    });
    const inventory: unknown = JSON.parse(
      await readFile(path.join(root, INVENTORY_OUTPUT), 'utf8'),
    );
    return variantInventoryOf(inventory);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function liveEslintInventory(): Promise<EslintInventory> {
  const names = Object.keys(ESLINT_VARIANTS);
  return Object.fromEntries(
    await Promise.all(names.map(async (name) => [name, await liveInventoryOf(name)] as const)),
  );
}

export function readEslintInventory(): EslintInventory {
  const inventory: unknown = JSON.parse(readFileSync(INVENTORY_FILE, 'utf8'));
  return inventoryOf(inventory);
}

export function writeEslintInventory(text: string): void {
  const temporary = new URL(`./eslint-inventory.${String(process.pid)}.tmp`, import.meta.url);
  writeFileSync(temporary, text);
  renameSync(temporary, INVENTORY_FILE);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [variant = '', root = ''] = process.argv.slice(2);
  const configs = await Promise.all(
    ESLINT_CONFIGS.map(async ([tool, url]): Promise<ConfigEntry> => [
      tool,
      configOfModule(await import(url.href)),
    ]),
  );
  const inventory = await inventoryOfConfigs({
    configs,
    cwd: root,
    files: variantOf(variant).files,
  });
  writeFileSync(path.join(root, INVENTORY_OUTPUT), JSON.stringify(inventory));
}
