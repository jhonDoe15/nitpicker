import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ancestorDirectories, pathInside } from '../../../../../shared/filesystem.mts';
import { checkoutModuleUrl } from '../../../../../shared/paths/checkout-module.mts';
import { typescriptApi } from '../../typed/typescript-program.mts';
import { fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import type { Override, Partition, Translation } from '../plan/oxlint-shapes.mts';
import { ownedNativePlugins } from '../native/owned-native-rules.mts';
import { materializedDirectory } from './oxlint-inline-config.mts';
import { stageConfigOptions } from './oxlint-paths.mts';

export type StageConfig = {
  readonly configPath: string;
  readonly nativeConfigPath: string;
  readonly files: readonly string[];
  readonly typeAware: boolean;
};

type OxlintConfig = {
  readonly plugins: readonly string[];
  readonly jsPlugins: readonly string[];
  readonly categories: Readonly<Record<string, string>>;
  readonly settings: unknown;
  readonly overrides: readonly Override[];
};

const ts = typescriptApi();

const STAGE_DIRECTORY = '.nitpicker-oxlint';

export function hideNestedTypeScriptConfigs(
  stage: string,
  projectRoot: string,
  files: readonly string[],
): void {
  for (const directory of nestedConfigDirectories(projectRoot, files)) {
    const stageDirectory = materializedDirectory({
      stage,
      projectRoot,
      relativeDirectory: directory,
    });
    unlinkSync(path.join(stageDirectory, 'tsconfig.json'));
  }
}

function nestedConfigDirectories(projectRoot: string, files: readonly string[]): string[] {
  const directories = new Set(files.flatMap((file) => relativeAncestors(path.posix.dirname(file))));
  return [...directories]
    .sort()
    .filter((directory) => existsSync(path.join(projectRoot, directory, 'tsconfig.json')));
}

function relativeAncestors(directory: string): string[] {
  const segments = directory === '.' ? [] : directory.split('/');
  return segments.map((_segment, index) => segments.slice(0, index + 1).join('/'));
}

export type Stage = {
  readonly root: string;
  readonly stage: string;
};

export function createStage(projectRoot: string, projectConfigPath: string | undefined): Stage {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-oxlint-')));
  try {
    const stage =
      projectConfigPath === undefined ? root : mirroredAncestors(root, path.resolve(projectRoot));
    for (const entry of readdirSync(projectRoot)) {
      if (projectConfigPath !== undefined && entry === 'tsconfig.json') continue;
      symlinkSync(path.join(projectRoot, entry), path.join(stage, entry));
    }
    if (projectConfigPath !== undefined) {
      writeFileSync(
        path.join(stage, 'tsconfig.json'),
        lintTypeScriptConfig(projectConfigPath, stage),
      );
    }
    mkdirSync(path.join(stage, STAGE_DIRECTORY));
    return { root, stage };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function mirroredAncestors(root: string, projectRoot: string): string {
  const ancestors = ancestorDirectories(projectRoot).slice(1);
  const depth = ancestors.reduce(
    (deepest, ancestor, index) => (isWorkspaceLevel(ancestor) ? index + 1 : deepest),
    0,
  );
  const chain = [projectRoot, ...ancestors].slice(0, depth + 1).reverse();
  let mirror = root;
  for (const directory of chain.slice(1)) {
    const name = path.basename(directory);
    for (const entry of readdirSync(path.dirname(directory), { withFileTypes: true })) {
      const link = pathInside(mirror, entry.name);
      if (link !== undefined && entry.name !== name) {
        symlinkSync(path.join(entry.parentPath, entry.name), link);
      }
    }
    mirror = path.join(mirror, name);
    mkdirSync(mirror);
  }
  return mirror;
}

function isWorkspaceLevel(directory: string): boolean {
  return ['node_modules', '.git'].some((entry) => existsSync(path.join(directory, entry)));
}

function lintTypeScriptConfig(projectConfigPath: string, stage: string): string {
  const parsed = ts.parseConfigFileTextToJson(
    projectConfigPath,
    readFileSync(projectConfigPath, 'utf8'),
  );
  const config = fieldsOf(parsed.config);
  if (parsed.error !== undefined) {
    throw new Error(`Lint TypeScript config ${projectConfigPath} is not valid JSON`);
  }
  const rebased = {
    ...config,
    ...(config['extends'] === undefined
      ? {}
      : { extends: rebasedExtends(config['extends'], path.dirname(projectConfigPath)) }),
  };
  const { compilerOptions, unset, typeFiles } = stageConfigOptions(
    rebased,
    projectConfigPath,
    stage,
  );
  return JSON.stringify({
    ...rebased,
    ...(typeFiles.length === 0 ? {} : { files: [...listOf(config['files']), ...typeFiles] }),
    compilerOptions: {
      ...fieldsOf(config['compilerOptions']),
      ...compilerOptions,
      ...Object.fromEntries(unset.map((option) => [option, null])),
      noEmit: true,
    },
  });
}

function rebasedExtends(value: unknown, directory: string): unknown {
  return Array.isArray(value)
    ? value.map((entry) => rebasedExtend(entry, directory))
    : rebasedExtend(value, directory);
}

function rebasedExtend(value: unknown, directory: string): unknown {
  return typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'))
    ? path.resolve(directory, value)
    : value;
}

export function writeStageConfigs({
  stage,
  projectRoot,
  sampleFile,
  translation,
}: {
  readonly stage: string;
  readonly projectRoot: string;
  readonly sampleFile: string | undefined;
  readonly translation: Translation;
}): StageConfig[] {
  const bridge = checkoutModuleUrl(new URL('../oxlint-bridge.mjs', import.meta.url)).href;
  const jsPlugins = translation.plugins.map((plugin) => {
    const request = { ...plugin, projectRoot, sampleFile };
    writeFileSync(
      path.join(stage, STAGE_DIRECTORY, `${plugin.alias}.mjs`),
      `import { bridgedPlugin } from ${JSON.stringify(bridge)};\nexport default await bridgedPlugin(${JSON.stringify(request)});\n`,
    );
    return `./${STAGE_DIRECTORY}/${plugin.alias}.mjs`;
  });
  const bridgedRulePrefixes = translation.plugins.map(({ alias }) => `${alias}/`);
  const { typeAwareRules } = translation;
  const plain = translation.partitions.map((partition) => ({
    partition: withRules(partition, (rule) => !typeAwareRules.has(rule)),
    plugins: jsPlugins,
    typeAware: false,
  }));
  const typed = typeAwarePartition(translation.partitions, typeAwareRules);
  const passes = typed === undefined ? plain : [...plain, { ...typed, plugins: [] }];
  return passes.map(({ partition, plugins, typeAware }, index) => {
    const configPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}.json`);
    const nativeConfigPath = path.join(stage, `${STAGE_DIRECTORY}rc-${String(index)}-native.json`);
    const config = stageConfig(partition, plugins);
    writeFileSync(configPath, JSON.stringify(config, null, 2));
    writeFileSync(nativeConfigPath, JSON.stringify(nativeConfig(config, bridgedRulePrefixes)));
    return { configPath, nativeConfigPath, files: partition.files, typeAware };
  });
}

function withRules(partition: Partition, keeps: (rule: string) => boolean): Partition {
  return {
    ...partition,
    overrides: partition.overrides.map((override) => ({
      ...override,
      rules: Object.fromEntries(Object.entries(override.rules).filter(([rule]) => keeps(rule))),
    })),
  };
}

function typeAwarePartition(
  partitions: readonly Partition[],
  typeAwareRules: ReadonlySet<string>,
): { readonly partition: Partition; readonly typeAware: true } | undefined {
  const typed = partitions
    .map((partition) => withRules(partition, (rule) => typeAwareRules.has(rule)))
    .filter(({ overrides }) => overrides.some(({ rules }) => Object.keys(rules).length > 0));
  if (typed.length === 0) {
    return undefined;
  }
  return {
    partition: {
      settings: {},
      files: [...new Set(partitions.flatMap(({ files }) => files))],
      overrides: typed.flatMap(({ overrides }) =>
        overrides.filter(({ rules }) => Object.keys(rules).length > 0),
      ),
    },
    typeAware: true,
  };
}

function nativeConfig(config: OxlintConfig, bridgedRulePrefixes: readonly string[]): OxlintConfig {
  return {
    ...config,
    jsPlugins: [],
    overrides: config.overrides.map((override) => ({
      ...override,
      rules: nativeRules(override.rules, bridgedRulePrefixes),
    })),
  };
}

function nativeRules(
  rules: Readonly<Record<string, unknown>>,
  bridgedRulePrefixes: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(rules).filter(
      ([rule]) => !bridgedRulePrefixes.some((prefix) => rule.startsWith(prefix)),
    ),
  );
}

function stageConfig(
  { settings, overrides }: Partition,
  jsPlugins: readonly string[],
): OxlintConfig {
  const categories = [
    'correctness',
    'suspicious',
    'pedantic',
    'perf',
    'restriction',
    'style',
    'nursery',
  ];
  return {
    plugins: ['typescript', 'vitest', ...ownedNativePlugins()],
    jsPlugins,
    categories: Object.fromEntries(categories.map((category) => [category, 'off'])),
    settings,
    overrides,
  };
}
