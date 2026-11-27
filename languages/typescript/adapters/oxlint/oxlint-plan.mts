import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mts';
import { listNativeRules } from './plan/rule-listing.mts';
import { listedFiles } from './plan/listed-files.mts';
import { readLayout } from '../../preset/head-policy.mts';
import { END_TO_END_ROOT } from '../../preset/layout/end-to-end.mts';
import { parsedTsconfig } from '../../preset/modules/tsconfig-files.mts';
import { isInvokedModule } from '../typed/static-checks.mts';
import { incompatiblePackageMessage } from '../lint-engine/compatibility/incompatible-package.mts';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import { configResolver } from './plan/configs/config-resolver.mts';

type Settings = Readonly<Record<string, unknown>>;

type GroupSettings = {
  readonly rules: Settings;
  readonly globals: Readonly<Record<string, string>>;
  readonly settings: unknown;
  readonly programRules?: readonly string[];
};

type Group = GroupSettings & { readonly files: string[] };

type KeyedSettings = { readonly settings: GroupSettings; readonly key: string };

type Derived = {
  readonly plain: KeyedSettings;
  readonly metadata: KeyedSettings;
  readonly metadataRules: readonly string[];
  readonly noInlineConfig: boolean;
};

type Plan = {
  readonly groups: Map<string, Group>;
  readonly noInlineConfig: string[];
  readonly typedPluginRules: Set<string>;
  readonly ruleMessages: Record<string, unknown>;
  readonly metadataProjects: Map<string, boolean>;
  readonly derived: WeakMap<object, Derived>;
};

const readTsconfig: (configFile: string) => { readonly options: Settings } = parsedTsconfig;
const DECORATOR_METADATA_RULES = ['@typescript-eslint/consistent-type-imports'];
const DECORATOR = /(?:^|[\s(,])@[A-Za-z_$]/mu;
const wrapperConfigPath = fileURLToPath(
  checkoutModuleUrl(new URL('../eslint-wrapper.config.mjs', import.meta.url)),
);

if (isInvokedModule(import.meta.url)) {
  const [projectRoot = '', ...patterns] = process.argv.slice(2);
  try {
    process.stdout.write(`${JSON.stringify(await lintPlan(projectRoot, patterns))}\n`);
  } catch (error) {
    process.stderr.write(`oxlint planning failed: ${planningFailure(error)}\n`);
    process.exitCode = 2;
  }
}

function planningFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  return incompatiblePackageMessage(error.stack ?? '', { cwd: process.cwd() }) ?? error.message;
}

async function lintPlan(root: string, globs: readonly string[]) {
  const [nativeRules, plan] = await Promise.all([
    listNativeRules(process.env),
    filePlan(root, globs, () => configResolver(root, wrapperConfigPath)),
  ]);
  return { ...plan, nativeRules };
}

type ConfigOf = (file: string) => Promise<unknown>;

export async function filePlan(
  root: string,
  globs: readonly string[],
  resolver: () => Promise<ConfigOf>,
) {
  let configOf: ConfigOf | undefined;
  const plan: Plan = {
    groups: new Map(),
    noInlineConfig: [],
    typedPluginRules: new Set(),
    ruleMessages: {},
    metadataProjects: new Map(),
    derived: new WeakMap(),
  };
  for (const file of candidateFiles(root, globs)) {
    configOf ??= await resolver();
    const config = await configOf(file);
    if (config !== undefined) {
      addFile(plan, { root, file }, config);
    }
  }
  return {
    groups: [...plan.groups.values()],
    noInlineConfig: plan.noInlineConfig,
    typedPluginRules: [...plan.typedPluginRules],
    ruleMessages: plan.ruleMessages,
    ...(readLayout().isEndToEndTest(`${END_TO_END_ROOT}/`)
      ? { endToEndRoot: END_TO_END_ROOT }
      : {}),
  };
}

function addFile(plan: Plan, { root, file }: { root: string; file: string }, config: unknown) {
  const derived = derivedConfig(plan, config);
  const programRules = programRulesOf(derived, path.join(root, file));
  addToGroup(plan.groups, file, programRules.length === 0 ? derived.plain : derived.metadata);
  if (derived.noInlineConfig) {
    plan.noInlineConfig.push(file);
  }
}

function programRulesOf({ metadataRules }: Derived, absoluteFile: string) {
  return metadataRules.length > 0 && DECORATOR.test(readFileSync(absoluteFile, 'utf8'))
    ? metadataRules
    : [];
}

function derivedConfig(plan: Plan, config: unknown): Derived {
  const key = typeof config === 'object' && config !== null ? config : {};
  const known = plan.derived.get(key);
  if (known !== undefined) {
    return known;
  }
  const rules = enabledRules(fieldOf(config, 'rules'));
  const metadataRules = metadataRulesOf(plan.metadataProjects, config, rules);
  const plain: GroupSettings = {
    rules,
    globals: sortedGlobals(fieldOf(fieldOf(config, 'languageOptions'), 'globals')),
    settings: fieldOf(config, 'settings') ?? {},
  };
  for (const ruleId of typedRulesOf(config, rules)) {
    plan.typedPluginRules.add(ruleId);
  }
  addRuleMessages(plan.ruleMessages, config, rules);
  const derived: Derived = {
    plain: keyed(plain),
    metadata: keyed({ ...plain, programRules: metadataRules }),
    metadataRules,
    noInlineConfig: fieldOf(fieldOf(config, 'linterOptions'), 'noInlineConfig') === true,
  };
  plan.derived.set(key, derived);
  return derived;
}

function keyed(settings: GroupSettings): KeyedSettings {
  return { settings, key: JSON.stringify(settings) };
}

function candidateFiles(root: string, globs: readonly string[]) {
  const files =
    listedFiles(process.env) ??
    globSync([...globs], {
      cwd: root,
      exclude: (entry) => entry === 'node_modules' || entry.endsWith('/node_modules'),
    });
  return [...new Set(files.map((file) => file.replaceAll('\\', '/')))].sort();
}

function enabledRules(rules: unknown = {}): Settings {
  return Object.fromEntries(
    Object.entries(fieldsOf(rules))
      .filter(([, setting]) => severityOf(setting) !== 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function severityOf(setting: unknown): unknown {
  const severity: unknown = Array.isArray(setting) ? setting[0] : setting;
  return severity === 'off' ? 0 : severity;
}

function sortedGlobals(globals: unknown = {}): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(fieldsOf(globals))
      .map(([name, value]) => [name, globalAccess(value)] as const)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function globalAccess(value: unknown): string {
  if (value === true || value === 'writable' || value === 'writeable') {
    return 'writable';
  }
  if (value === 'off') {
    return 'off';
  }
  return 'readonly';
}

function addToGroup(groups: Map<string, Group>, file: string, { settings, key }: KeyedSettings) {
  const group = groups.get(key) ?? { files: [], ...settings };
  group.files.push(file);
  groups.set(key, group);
}

function ruleDefinition(config: unknown, ruleId: string): unknown {
  const separator = ruleId.lastIndexOf('/');
  const plugins = fieldOf(config, 'plugins');
  if (separator === -1) {
    return fieldOf(fieldOf(fieldOf(plugins, '@'), 'rules'), ruleId);
  }
  return fieldOf(
    fieldOf(fieldOf(plugins, ruleId.slice(0, separator)), 'rules'),
    ruleId.slice(separator + 1),
  );
}

function typedRulesOf(config: unknown, rules: Settings) {
  return Object.keys(rules).filter(
    (ruleId) =>
      fieldOf(
        fieldOf(fieldOf(ruleDefinition(config, ruleId), 'meta'), 'docs'),
        'requiresTypeChecking',
      ) === true,
  );
}

function projectFilesOf(parserOptions: unknown) {
  const project = fieldOf(parserOptions, 'project');
  const tsconfigRootDir = fieldOf(parserOptions, 'tsconfigRootDir');
  if (typeof tsconfigRootDir !== 'string') {
    return [];
  }
  const projects: readonly unknown[] = project === true ? ['tsconfig.json'] : [project].flat();
  return projects
    .filter((name) => typeof name === 'string')
    .map((name) => path.resolve(tsconfigRootDir, name));
}

function emitsDecoratorMetadata(projects: Map<string, boolean>, configFile: string) {
  const known = projects.get(configFile);
  if (known !== undefined) {
    return known;
  }
  const { options } = readTsconfig(configFile);
  const emits =
    options['experimentalDecorators'] === true && options['emitDecoratorMetadata'] === true;
  projects.set(configFile, emits);
  return emits;
}

function metadataRulesOf(projects: Map<string, boolean>, config: unknown, enabled: Settings) {
  const configured = DECORATOR_METADATA_RULES.filter((ruleId) => ruleId in enabled);
  const configFiles = projectFilesOf(
    fieldOf(fieldOf(config, 'languageOptions'), 'parserOptions') ?? {},
  );
  if (
    configured.length === 0 ||
    !configFiles.some((file) => emitsDecoratorMetadata(projects, file))
  ) {
    return [];
  }
  return configured;
}

function addRuleMessages(ruleMessages: Record<string, unknown>, config: unknown, rules: Settings) {
  for (const ruleId of Object.keys(rules)) {
    ruleMessages[ruleId] ??=
      fieldOf(fieldOf(ruleDefinition(config, ruleId), 'meta'), 'messages') ?? {};
  }
}
