import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import { checkoutModuleUrl } from '../../../../shared/paths/checkout-module.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';

type BridgeRequest = {
  readonly namespace: string;
  readonly alias: string;
  readonly ruleNames: readonly string[];
};

type BridgedPlugin = { readonly meta: { readonly name: string }; readonly rules: unknown };

export const CORE_RULES_NAMESPACE = '';

const wrapperPath = fileURLToPath(
  checkoutModuleUrl(new URL('../eslint-wrapper.config.mjs', import.meta.url)),
);

export async function bridgedPlugin({
  namespace,
  alias,
  ruleNames,
}: BridgeRequest): Promise<BridgedPlugin> {
  const rules =
    namespace === CORE_RULES_NAMESPACE ? coreRules(ruleNames) : await pluginRules(namespace);
  return { meta: { name: alias }, rules };
}

function coreRules(ruleNames: readonly string[]): Record<string, unknown> {
  const plugins = listOf(ESLint.defaultConfig).map((entry) => fieldOf(entry, 'plugins'));
  const rules = fieldOf(
    plugins.find((plugin) => fieldOf(plugin, '@') !== undefined),
    '@',
  );
  return Object.fromEntries(
    ruleNames.map((name) => [name, fieldOf(fieldOf(rules, 'rules'), name)]),
  );
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
