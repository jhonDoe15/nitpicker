import { hasScopePackage, productionScope, storyGlobs } from '../scope-support.mjs';
import { i18nRules } from './i18n-rules.mjs';

export function isI18nProject({ projectRoot, i18n = {} }) {
  return i18n.enabled ?? hasScopePackage(projectRoot, 'i18n');
}

function formatjsSettings({ functionNames, componentNames }) {
  return {
    ...(functionNames === undefined ? {} : { additionalFunctionNames: functionNames }),
    ...(componentNames === undefined ? {} : { additionalComponentNames: componentNames }),
  };
}

export async function i18nScopeConfigFor(layout, i18n = {}) {
  const { i18nPlugin } = await import('./i18n-plugin.mjs');
  const { files, ignores } = productionScope(layout);
  return [
    {
      files,
      ignores: [...ignores, ...storyGlobs],
      plugins: { formatjs: i18nPlugin },
      settings: { formatjs: formatjsSettings(i18n) },
      rules: Object.fromEntries(
        Object.entries(i18nRules).map(([name, { setting }]) => [`formatjs/${name}`, setting]),
      ),
    },
  ];
}
