import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { layeredPolicy } from './lint-engine/project-layer.mjs';

const policyConfigPath = requiredEnvironmentPath('NITPICKER_DIFF_ESLINT_POLICY_CONFIG');
const projectRoot = requiredEnvironmentPath('NITPICKER_DIFF_ESLINT_PROJECT_ROOT');
const projectConfigPath = optionalEnvironmentPath('NITPICKER_DIFF_ESLINT_PROJECT_CONFIG');
const policyModule = await import(pathToFileURL(policyConfigPath).href);

if (!Array.isArray(policyModule.default)) {
  throw new TypeError(`ESLint policy ${policyConfigPath} must export a flat configuration array`);
}

const selectedRules = selectedRuleIds(process.env.NITPICKER_DIFF_ESLINT_ONLY_RULES);

export default (await layeredPolicy(policyModule.default, process.env)).map((entry) =>
  rebaseTypeScriptProject(entry, projectRoot, projectConfigPath),
);

function selectedRuleIds(selection) {
  return selection === undefined || selection.length === 0
    ? undefined
    : new Set(JSON.parse(selection));
}

function withSelectedRules(entry) {
  if (selectedRules === undefined || entry?.rules === undefined) {
    return entry;
  }
  return {
    ...entry,
    rules: Object.fromEntries(
      Object.entries(entry.rules).map(([ruleId, setting]) => [
        ruleId,
        selectedRules.has(ruleId) ? setting : 'off',
      ]),
    ),
  };
}

function rebaseTypeScriptProject(policyEntry, root, configPath) {
  const entry = withSelectedRules(policyEntry);
  const parserOptions = entry?.languageOptions?.parserOptions;
  if (parserOptions?.tsconfigRootDir === undefined) {
    return entry;
  }

  return {
    ...entry,
    languageOptions: {
      ...entry.languageOptions,
      parserOptions: {
        ...parserOptions,
        project: parserOptions.project
          ? (configPath ?? parserOptions.project)
          : parserOptions.project,
        tsconfigRootDir: root,
      },
    },
  };
}

function requiredEnvironmentPath(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return path.resolve(value);
}

function optionalEnvironmentPath(name) {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : path.resolve(value);
}
