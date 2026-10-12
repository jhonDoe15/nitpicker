import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';

export const CORE_RULES_NAMESPACE = '';

const wrapperPath = path.join(import.meta.dirname, 'eslint-config-wrapper.mjs');

export async function bridgedPlugin({ namespace, alias, ruleNames, projectRoot, sampleFile }) {
  const rules =
    namespace === CORE_RULES_NAMESPACE
      ? await coreRules({ ruleNames, projectRoot, sampleFile })
      : await pluginRules(namespace);
  return { meta: { name: alias }, rules };
}

async function coreRules({ ruleNames, projectRoot, sampleFile }) {
  const eslint = new ESLint({ cwd: projectRoot, overrideConfigFile: wrapperPath });
  const { plugins } = await eslint.calculateConfigForFile(sampleFile);
  return Object.fromEntries(ruleNames.map((name) => [name, plugins['@'].rules[name]]));
}

async function pluginRules(namespace) {
  const { default: entries } = await import(pathToFileURL(wrapperPath).href);
  const plugin = entries.find((entry) => entry?.plugins?.[namespace] !== undefined)?.plugins[
    namespace
  ];
  if (plugin === undefined) {
    throw new Error(`ESLint plugin ${namespace} is not part of the lint policy`);
  }
  return plugin.rules;
}
