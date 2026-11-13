import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { fieldOf } from '../../../../shared/values/readers.mts';

type BridgeRequest = {
  readonly namespace: string;
  readonly alias: string;
  readonly ruleNames: readonly string[];
  readonly projectRoot: string;
  readonly sampleFile: string;
};

type BridgedPlugin = { readonly meta: { readonly name: string }; readonly rules: unknown };

export const CORE_RULES_NAMESPACE = '';

const wrapperPath = path.join(import.meta.dirname, '..', 'eslint-wrapper.config.mjs');

export async function bridgedPlugin({
  namespace,
  alias,
  ruleNames,
  projectRoot,
  sampleFile,
}: BridgeRequest): Promise<BridgedPlugin> {
  const rules =
    namespace === CORE_RULES_NAMESPACE
      ? await coreRules({ ruleNames, projectRoot, sampleFile })
      : await pluginRules(namespace);
  return { meta: { name: alias }, rules };
}

async function coreRules({
  ruleNames,
  projectRoot,
  sampleFile,
}: Omit<BridgeRequest, 'namespace' | 'alias'>): Promise<Record<string, unknown>> {
  const eslint = new ESLint({ cwd: projectRoot, overrideConfigFile: wrapperPath });
  const config: unknown = await eslint.calculateConfigForFile(sampleFile);
  const rules = fieldOf(fieldOf(fieldOf(config, 'plugins'), '@'), 'rules');
  return Object.fromEntries(ruleNames.map((name) => [name, fieldOf(rules, name)]));
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

async function pluginRules(namespace: string): Promise<unknown> {
  const loaded: unknown = await import(pathToFileURL(wrapperPath).href);
  const entries = listOf(fieldOf(loaded, 'default'));
  const plugin = fieldOf(
    fieldOf(
      entries.find((entry) => fieldOf(fieldOf(entry, 'plugins'), namespace) !== undefined),
      'plugins',
    ),
    namespace,
  );
  if (plugin === undefined) {
    throw new Error(`ESLint plugin ${namespace} is not part of the lint policy`);
  }
  return fieldOf(plugin, 'rules');
}
