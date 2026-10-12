import { globSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';

const [projectRoot, ...patterns] = process.argv.slice(2);
const wrapperConfigPath = path.join(import.meta.dirname, 'eslint-config-wrapper.mjs');

try {
  process.stdout.write(`${JSON.stringify(await lintPlan(projectRoot, patterns))}\n`);
} catch (error) {
  process.stderr.write(
    `oxlint planning failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
}

async function lintPlan(root, globs) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: wrapperConfigPath });
  const groups = new Map();
  const noInlineConfig = [];
  const typedPluginRules = new Set();
  for (const file of candidateFiles(root, globs)) {
    const config = await lintedConfig(eslint, file);
    if (config === undefined) continue;
    const rules = enabledRules(config.rules);
    addToGroup(groups, file, { rules, globals: sortedGlobals(config.languageOptions?.globals) });
    if (config.linterOptions?.noInlineConfig === true) noInlineConfig.push(file);
    for (const ruleId of typedRulesOf(config, rules)) typedPluginRules.add(ruleId);
  }
  return { groups: [...groups.values()], noInlineConfig, typedPluginRules: [...typedPluginRules] };
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
