import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../shared/paths/checkout-module.mjs';
import { layeredPolicy as untypedLayeredPolicy } from './lint-engine/project-layer.mjs';
import { fieldOf, fieldsOf, listOf, parseJson, textsOf } from '../../../shared/values/readers.mts';
import type { Environment } from '../../../shared/processes/environment.mts';
import { guardedEntry } from '../preset/eslint-config/fix-guards/guarded-plugins.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const DEFAULT_EXPORT = 'default';

type PolicyEntry = Readonly<Record<string, unknown>>;

const layeredPolicy: (
  entries: readonly PolicyEntry[],
  environment: Environment,
) => Promise<PolicyEntry[]> = untypedLayeredPolicy;

const policyConfigPath = requiredEnvironmentPath('NITPICKER_DIFF_ESLINT_POLICY_CONFIG');
const projectRoot = requiredEnvironmentPath('NITPICKER_DIFF_ESLINT_PROJECT_ROOT');
const projectConfigPath = optionalEnvironmentPath('NITPICKER_DIFF_ESLINT_PROJECT_CONFIG');
const policyModule: unknown = await import(
  pathToFileURL(checkoutModulePath(policyConfigPath)).href
);

const extraPolicyPath = optionalEnvironmentPath('NITPICKER_DIFF_ESLINT_EXTRA_POLICY_CONFIG');
const extraPolicyModule: unknown =
  extraPolicyPath === undefined
    ? undefined
    : await import(pathToFileURL(checkoutModulePath(extraPolicyPath)).href);

if (!(
  Array.isArray(fieldOf(policyModule, DEFAULT_EXPORT)) &&
  Array.isArray(fieldOf(extraPolicyModule, DEFAULT_EXPORT) ?? [])
)) {
  throw new TypeError(`ESLint policy ${policyConfigPath} must export a flat configuration array`);
}

const selectedRules = selectedRuleIds(process.env['NITPICKER_DIFF_ESLINT_ONLY_RULES']);

export default (
  await layeredPolicy(
    [...entriesOf(policyModule), ...scopedEntries(extraPolicyModule)],
    process.env,
  )
).map((entry) => guardedEntry(rebaseTypeScriptProject(entry, projectRoot, projectConfigPath)));

function entriesOf(module: unknown): PolicyEntry[] {
  return listOf(fieldOf(module, DEFAULT_EXPORT)).map(fieldsOf);
}

function isIgnoreOnly(entry: PolicyEntry) {
  return Object.keys(entry).join() === 'ignores';
}

function scopedEntries(module: unknown) {
  const entries = entriesOf(module);
  const ignores = entries.filter(isIgnoreOnly).flatMap((entry) => listOf(entry['ignores']));
  return entries
    .filter((entry) => !isIgnoreOnly(entry))
    .map((entry) => ({ ...entry, ignores: [...listOf(entry['ignores']), ...ignores] }));
}

function selectedRuleIds(selection: string | undefined) {
  return selection === undefined || selection.length === 0
    ? undefined
    : new Set(textsOf(parseJson(selection)));
}

function withSelectedRules(entry: PolicyEntry) {
  if (selectedRules === undefined || entry['rules'] === undefined) {
    return entry;
  }
  return {
    ...entry,
    rules: Object.fromEntries(
      Object.entries(fieldsOf(entry['rules'])).map(([ruleId, setting]) => [
        ruleId,
        selectedRules.has(ruleId) ? setting : 'off',
      ]),
    ),
  };
}

function rebaseTypeScriptProject(
  policyEntry: PolicyEntry,
  root: string,
  configPath: string | undefined,
) {
  const entry = withSelectedRules(policyEntry);
  const languageOptions = fieldsOf(entry['languageOptions']);
  const parserOptions = fieldsOf(languageOptions['parserOptions']);
  if (parserOptions['tsconfigRootDir'] === undefined) {
    return entry;
  }

  return {
    ...entry,
    languageOptions: {
      ...languageOptions,
      parserOptions: {
        ...parserOptions,
        project: parserOptions['project']
          ? (configPath ?? parserOptions['project'])
          : parserOptions['project'],
        tsconfigRootDir: root,
      },
    },
  };
}

function requiredEnvironmentPath(name: string) {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  return path.resolve(value);
}

function optionalEnvironmentPath(name: string) {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? undefined : path.resolve(value);
}
