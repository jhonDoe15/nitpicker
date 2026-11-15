import type { Linter } from 'eslint';
import { type I18nSettings, type ScopeLayout, linterConfigs } from '../typed/config-types.mts';
import { hasScopePackage, productionScope, storyGlobs } from '../typed/scope-views.mts';
import { i18nRules } from './i18n-rules.mjs';

export function isI18nProject({
  projectRoot,
  i18n = {},
  javascript,
}: {
  projectRoot: string;
  i18n?: I18nSettings;
  javascript?: unknown;
}): boolean {
  if (javascript === true) {
    return false;
  }
  return i18n.enabled === undefined ? hasScopePackage(projectRoot, 'i18n') : Boolean(i18n.enabled);
}

function formatjsSettings({ functionNames, componentNames }: I18nSettings) {
  return {
    ...(functionNames === undefined ? {} : { additionalFunctionNames: functionNames }),
    ...(componentNames === undefined ? {} : { additionalComponentNames: componentNames }),
  };
}

export async function i18nScopeConfigFor(
  layout: ScopeLayout,
  i18n: I18nSettings = {},
): Promise<Linter.Config[]> {
  const { i18nPlugin } = await import('./i18n-plugin.mts');
  const { files, ignores } = productionScope(layout);
  return linterConfigs([
    {
      files,
      ignores: [...ignores, ...storyGlobs],
      plugins: { formatjs: i18nPlugin },
      settings: { formatjs: formatjsSettings(i18n) },
      rules: Object.fromEntries(
        Object.entries(i18nRules).map(([name, { setting }]) => [`formatjs/${name}`, setting]),
      ),
    },
  ]);
}
