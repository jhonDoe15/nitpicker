import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import { listNativeRules } from './plan/rule-listing.mts';
import { parsedTsconfig } from '../../preset/modules/tsconfig-files.mjs';
import { isInvokedModule } from '../typed/static-checks.mts';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';

type Settings = Readonly<Record<string, unknown>>;

type GroupSettings = {
  readonly rules: Settings;
  readonly globals: Readonly<Record<string, string>>;
  readonly settings: unknown;
  readonly programRules?: readonly string[];
};

type Group = GroupSettings & { readonly files: string[] };

type Plan = {
  readonly groups: Map<string, Group>;
  readonly noInlineConfig: string[];
  readonly typedPluginRules: Set<string>;
  readonly ruleMessages: Record<string, unknown>;
  readonly metadataProjects: Map<string, boolean>;
};

const readTsconfig: (configFile: string) => { readonly options: Settings } = parsedTsconfig;
const DECORATOR_METADATA_RULES = ['@typescript-eslint/consistent-type-imports'];
const DECORATOR = /(?:^|[\s(,])@[A-Za-z_$]/mu;
const wrapperConfigPath = path.join(import.meta.dirname, '..', 'eslint-wrapper.config.mjs');

if (isInvokedModule(import.meta.url)) {
  const [projectRoot = '', ...patterns] = process.argv.slice(2);
  try {
    process.stdout.write(`${JSON.stringify(await lintPlan(projectRoot, patterns))}\n`);
  } catch (error) {
    process.stderr.write(
      `oxlint planning failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  }
}

async function lintPlan(root: string, globs: readonly string[]) {
  const [nativeRules, plan] = await Promise.all([
    listNativeRules(process.env),
    filePlan(root, globs),
  ]);
  return { ...plan, nativeRules };
}

async function filePlan(root: string, globs: readonly string[]) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: wrapperConfigPath });
  const plan: Plan = {
    groups: new Map(),
    noInlineConfig: [],
    typedPluginRules: new Set(),
    ruleMessages: {},
    metadataProjects: new Map(),
  };
  for (const file of candidateFiles(root, globs)) {
    const config = await lintedConfig(eslint, file);
    if (config !== undefined) {
      addFile(plan, { root, file }, config);
    }
  }
  return {
    groups: [...plan.groups.values()],
    noInlineConfig: plan.noInlineConfig,
    typedPluginRules: [...plan.typedPluginRules],
    ruleMessages: plan.ruleMessages,
  };
}

function addFile(plan: Plan, { root, file }: { root: string; file: string }, config: unknown) {
  const rules = enabledRules(fieldOf(config, 'rules'));
  const programRules = programRulesOf(plan.metadataProjects, path.join(root, file), config);
  addToGroup(plan.groups, file, {
    rules,
    globals: sortedGlobals(fieldOf(fieldOf(config, 'languageOptions'), 'globals')),
    settings: fieldOf(config, 'settings') ?? {},
    ...(programRules.length === 0 ? {} : { programRules }),
  });
  if (fieldOf(fieldOf(config, 'linterOptions'), 'noInlineConfig') === true) {
    plan.noInlineConfig.push(file);
  }
  for (const ruleId of typedRulesOf(config, rules)) {
    plan.typedPluginRules.add(ruleId);
  }
  addRuleMessages(plan.ruleMessages, config, rules);
}

function candidateFiles(root: string, globs: readonly string[]) {
  const files = globSync([...globs], {
    cwd: root,
    exclude: (entry) => entry === 'node_modules' || entry.endsWith('/node_modules'),
  });
  return [...new Set(files.map((file) => file.replaceAll('\\', '/')))].sort();
}

async function lintedConfig(eslint: ESLint, file: string): Promise<unknown> {
  if (await eslint.isPathIgnored(file)) {
    return undefined;
  }
  const config: unknown = await eslint.calculateConfigForFile(file);
  return config;
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

function addToGroup(groups: Map<string, Group>, file: string, settings: GroupSettings) {
  const key = JSON.stringify(settings);
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

function programRulesOf(projects: Map<string, boolean>, absoluteFile: string, config: unknown) {
  const enabled = enabledRules(fieldOf(config, 'rules'));
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
  return DECORATOR.test(readFileSync(absoluteFile, 'utf8')) ? configured : [];
}

function addRuleMessages(ruleMessages: Record<string, unknown>, config: unknown, rules: Settings) {
  for (const ruleId of Object.keys(rules)) {
    ruleMessages[ruleId] ??=
      fieldOf(fieldOf(ruleDefinition(config, ruleId), 'meta'), 'messages') ?? {};
  }
}
