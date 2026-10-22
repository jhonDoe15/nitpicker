import { execFile } from 'node:child_process';
import { globSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { ESLint } from 'eslint';
import { oxlintBinary } from './oxlint-process.mjs';

const [projectRoot, ...patterns] = process.argv.slice(2);
const wrapperConfigPath = path.join(import.meta.dirname, '..', 'eslint-wrapper.config.mjs');
const MAX_LISTING_BYTES = 64 * 1024 * 1024;

try {
  process.stdout.write(`${JSON.stringify(await lintPlan(projectRoot, patterns))}\n`);
} catch (error) {
  process.stderr.write(
    `oxlint planning failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}

async function listedNativeRules() {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [oxlintBinary(), '--rules', '--format', 'json'],
    { cwd: import.meta.dirname, maxBuffer: MAX_LISTING_BYTES },
  );
  return JSON.parse(stdout);
}

async function lintPlan(root, globs) {
  const [nativeRules, plan] = await Promise.all([listedNativeRules(), filePlan(root, globs)]);
  return { ...plan, nativeRules };
}

async function filePlan(root, globs) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: wrapperConfigPath });
  const plan = {
    groups: new Map(),
    noInlineConfig: [],
    typedPluginRules: new Set(),
    screenedPluginRules: new Set(),
    ruleMessages: {},
  };
  for (const file of candidateFiles(root, globs)) {
    const config = await lintedConfig(eslint, file);
    if (config !== undefined) {
      addFile(plan, file, config);
    }
  }
  return {
    groups: [...plan.groups.values()],
    noInlineConfig: plan.noInlineConfig,
    typedPluginRules: [...plan.typedPluginRules],
    screenedPluginRules: [...plan.screenedPluginRules],
    ruleMessages: plan.ruleMessages,
  };
}

function addFile(plan, file, config) {
  const rules = enabledRules(config.rules);
  addToGroup(plan.groups, file, {
    rules,
    globals: sortedGlobals(config.languageOptions?.globals),
    settings: config.settings ?? {},
  });
  if (config.linterOptions?.noInlineConfig === true) plan.noInlineConfig.push(file);
  for (const ruleId of typedRulesOf(config, rules)) {
    plan.typedPluginRules.add(ruleId);
    if (ruleDefinition(config, ruleId).meta.docs.typeCheckingOnlyExempts === true) {
      plan.screenedPluginRules.add(ruleId);
    }
  }
  addRuleMessages(plan.ruleMessages, config, rules);
}

function candidateFiles(root, globs) {
  const files = globSync(globs, {
    cwd: root,
    exclude: (entry) => entry === 'node_modules' || entry.endsWith('/node_modules'),
  });
  return [...new Set(files.map((file) => file.replaceAll('\\', '/')))].sort();
}

async function lintedConfig(eslint, file) {
  if (await eslint.isPathIgnored(file)) return undefined;
  return eslint.calculateConfigForFile(file);
}

function enabledRules(rules = {}) {
  return Object.fromEntries(
    Object.entries(rules)
      .filter(([, setting]) => severityOf(setting) !== 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function severityOf(setting) {
  const severity = Array.isArray(setting) ? setting[0] : setting;
  return severity === 'off' ? 0 : severity;
}

function sortedGlobals(globals = {}) {
  return Object.fromEntries(
    Object.entries(globals)
      .map(([name, value]) => [name, globalAccess(value)])
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function globalAccess(value) {
  if (value === true || value === 'writable' || value === 'writeable') return 'writable';
  if (value === 'off') return 'off';
  return 'readonly';
}

function addToGroup(groups, file, settings) {
  const key = JSON.stringify(settings);
  const group = groups.get(key) ?? { files: [], ...settings };
  group.files.push(file);
  groups.set(key, group);
}

function ruleDefinition(config, ruleId) {
  const separator = ruleId.lastIndexOf('/');
  if (separator === -1) return config.plugins?.['@']?.rules?.[ruleId];
  return config.plugins?.[ruleId.slice(0, separator)]?.rules?.[ruleId.slice(separator + 1)];
}

function typedRulesOf(config, rules) {
  return Object.keys(rules).filter(
    (ruleId) => ruleDefinition(config, ruleId)?.meta?.docs?.requiresTypeChecking === true,
  );
}

function addRuleMessages(ruleMessages, config, rules) {
  for (const ruleId of Object.keys(rules)) {
    ruleMessages[ruleId] ??= ruleDefinition(config, ruleId)?.meta?.messages ?? {};
  }
}
