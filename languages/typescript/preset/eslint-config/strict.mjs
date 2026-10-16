import functional from 'eslint-plugin-functional';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { errorWrappingPolicy } from './policies/error-wrapping-policy.mjs';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectorsFor,
} from './strict/strict-escape-hatches.mjs';
import {
  declarationSelectorsFor,
  defaultExportSelectors,
  typeDefinitionSelectors,
  typedDeclarationRules,
} from './strict/strict-declarations.mjs';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
  forEachSelectors,
  loopSelectors,
} from './strict/strict-control-flow.mjs';
import {
  domainFunctionalRules,
  domainGlobsFor,
  domainRestrictedSyntax,
  domainTypeAwareFunctionalRules,
} from './strict/strict-domain.mjs';
import {
  adapterGlobsFor,
  restrictedAdapterSyntax,
  strictAdaptersTypedConfig,
} from './strict-adapters.mjs';
import { strictTestConfigFor } from './strict-tests.mjs';

export function restrictedSyntaxFor(options = {}) {
  const everywhereSelectors = [
    ...escapeHatchSelectorsFor(options),
    ...declarationSelectorsFor(options),
  ];
  const productionSelectors = [
    ...everywhereSelectors,
    ...typeDefinitionSelectors,
    ...defaultExportSelectors,
    ...controlFlowSelectors,
  ];
  return {
    configFile: everywhereSelectors,
    source: productionSelectors,
    domain: [
      ...productionSelectors.filter(
        (selector) => ![...loopSelectors, ...forEachSelectors].includes(selector),
      ),
      ...domainRestrictedSyntax,
    ],
    adapters: [...productionSelectors, ...restrictedAdapterSyntax],
  };
}

export const restrictedSyntaxByScope = restrictedSyntaxFor();

function configFileGlobsFor(layout) {
  return layout.sourceRoots.flatMap((root) => [`${root}/**/*.config.*`, `${root}/**/.*rc.*`]);
}

function productionScope(layout) {
  return { ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs] };
}

export function strictSyntaxConfigFor(layout = defaultResolvedLayout, options = {}) {
  const restrictedSyntax = restrictedSyntaxFor(options);
  return [
    { ignores: layout.excludedGlobs },
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser },
      linterOptions: escapeHatchLinterOptions,
      plugins: { nitpicker: nitpickerRules, '@typescript-eslint': tseslint.plugin },
      rules: {
        ...escapeHatchRules,
        ...controlFlowRules,
        'no-restricted-syntax': ['error', ...restrictedSyntax.source],
        'nitpicker/no-self-recursion': 'error',
      },
    },
    {
      files: configFileGlobsFor(layout),
      rules: { 'no-restricted-syntax': ['error', ...restrictedSyntax.configFile] },
    },
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      plugins: { functional, nitpicker: nitpickerRules },
      rules: {
        ...domainFunctionalRules,
        'no-restricted-syntax': ['error', ...restrictedSyntax.domain],
        'nitpicker/no-throw': 'error',
        'nitpicker/no-unknown-in-domain': 'error',
      },
    },
    {
      files: adapterGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      plugins: { nitpicker: nitpickerRules },
      rules: {
        'no-restricted-syntax': ['error', ...restrictedSyntax.adapters],
        'no-empty': ['error', { allowEmptyCatch: false }],
        'nitpicker/no-silent-catch': 'error',
        'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
        'nitpicker/no-handwritten-boundary-guard': 'error',
      },
    },
  ];
}

export const strictSyntaxConfig = strictSyntaxConfigFor();

function strictTypedConfigFor(layout, parserOptions) {
  return [
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { '@typescript-eslint': tseslint.plugin, nitpicker: nitpickerRules },
      rules: {
        ...typedDeclarationRules,
        ...controlFlowTypedRules,
        'nitpicker/exhaustive-union-predicate': 'error',
        'nitpicker/no-forwarding-wrapper': 'error',
      },
    },
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { functional, nitpicker: nitpickerRules },
      rules: domainTypeAwareFunctionalRules,
    },
    ...strictAdaptersTypedConfig.map((entry) => ({
      ...entry,
      files: adapterGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
    })),
  ];
}

function strictTypedConfig(parserOptions) {
  return strictTypedConfigFor(defaultResolvedLayout, parserOptions);
}

export function strictConfig(parserOptions) {
  return [...strictSyntaxConfig, ...strictTypedConfig(parserOptions)];
}

export const strictProductionRules = {
  'nitpicker/no-branch-in-composition-root': 'error',
  'nitpicker/no-module-level-let': 'error',
  'nitpicker/no-uninjectable-delay': 'error',
  'nitpicker/no-unvalidated-schema-field': 'error',
};

export function strictPresetConfig(layout, parserOptions, options = {}) {
  return [
    ...strictSyntaxConfigFor(layout, options),
    ...strictTypedConfigFor(layout, parserOptions),
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      plugins: { nitpicker: nitpickerRules },
      rules: strictProductionRules,
    },
    ...strictTestConfigFor(layout),
  ];
}
