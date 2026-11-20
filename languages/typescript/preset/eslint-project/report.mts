import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { layerEntries as untypedLayerEntries } from '../../adapters/lint-engine/project-layer.mts';
import { replacedOptionRules as untypedReplacedOptionRules } from '../../adapters/lint-engine/project-rules.mts';
import { RULE_EXCEPTION_ENTRY } from '../eslint-config/exceptions.mts';
import {
  headPolicyEnvironment as untypedHeadPolicyEnvironment,
  readLayout,
} from '../head-policy.mts';
import { byText } from '../../../../shared/text-order/by-text.mjs';
import { fieldOf } from '../../../../shared/values/readers.mts';
import { createQualityChecks } from '../quality-checks.mts';

type FlatEntry = Readonly<Record<string, unknown>>;

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;
const layerEntries: (file: string) => Promise<FlatEntry[]> = untypedLayerEntries;
const replacedOptionRules: (
  policyEntries: readonly FlatEntry[],
  projectEntries: readonly FlatEntry[],
) => string[] = untypedReplacedOptionRules;
const headPolicyEnvironment: (
  policyFile: string | undefined,
) => Record<string, string | undefined> = untypedHeadPolicyEnvironment;

const packageRoot = path.resolve(import.meta.dirname, '../../../..');

async function replacedRules(projectConfig: string): Promise<string[]> {
  const project = await layerEntries(projectConfig);
  const rules = new Set<string>();
  for (const { configRelativePath } of createQualityChecks(readLayout()).eslintChecks) {
    const policy: unknown = await import(
      pathToFileURL(checkoutModulePath(path.join(packageRoot, configRelativePath))).href
    );
    const policyEntries: unknown = fieldOf(policy, 'default');
    const entries = (Array.isArray(policyEntries) ? policyEntries : []).filter(
      (entry): entry is FlatEntry => fieldOf(entry, 'name') !== RULE_EXCEPTION_ENTRY,
    );
    for (const rule of replacedOptionRules(entries, project)) {
      rules.add(rule);
    }
  }
  return [...rules].toSorted(byText);
}

const [projectConfig, reportFile, policyFile, projectRoot] = process.argv.slice(2);
if (projectConfig === undefined || reportFile === undefined) {
  throw new TypeError('The ESLint project report needs a project config and a report file');
}
Object.assign(process.env, {
  ...headPolicyEnvironment(policyFile),
  NITPICKER_DIFF_ESLINT_PROJECT_ROOT: projectRoot,
});

async function report(projectConfig: string): Promise<{ rules: string[] } | { error: string }> {
  try {
    return { rules: await replacedRules(projectConfig) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

writeFileSync(reportFile, JSON.stringify(await report(projectConfig)));
