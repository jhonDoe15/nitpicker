import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../eslint-plugin/index.mjs';
import { functionalPlugin } from '../eslint-plugin/type-identity/functional-plugin.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { errorWrappingPolicy } from './policies/error-wrapping-policy.mjs';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectors,
  nullSelectorsFor,
} from './strict/strict-escape-hatches.mjs';
import {
  declarationSelectorsFor,
  defaultExportSelectors,
  moduleSurfaceSelectors,
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
  domainPurityRules,
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
import { configFileGlobsFor, productionPolicyConfigFor } from './policy/production-policy.mjs';

export function restrictedSyntaxFor(options = {}) {
  const everywhereSelectors = [...escapeHatchSelectors, ...declarationSelectorsFor(options)];
  const productionSelectors = [
    ...everywhereSelectors,
    ...typeDefinitionSelectors,
    ...moduleSurfaceSelectors,
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

function productionScope(layout) {
  return { ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs] };
}

function sourceSyntaxBans(options) {
  return {
    'nitpicker/no-default-export': ['error', ...defaultExportSelectors],
    'nitpicker/no-null': ['error', ...nullSelectorsFor(options)],
  };
}

const configFileAllowances = {
  'nitpicker/no-default-export': 'off',
  'nitpicker/no-promise-chain': 'off',
};

function frameworkFileEntries(files = []) {
  return files.length === 0
    ? []
    : [
        {
          files,
          plugins: { nitpicker: nitpickerRules },
          rules: { 'nitpicker/no-default-export': 'off' },
        },
      ];
}

const domainRules = {
  ...domainFunctionalRules,
  ...domainPurityRules,
  'nitpicker/no-throw': 'error',
  'nitpicker/no-ui-framework-in-domain': 'error',
  'nitpicker/no-unknown-in-domain': 'error',
};

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
        ...sourceSyntaxBans(options),
        'nitpicker/no-self-recursion': 'error',
        'nitpicker/no-tri-state-boolean': 'error',
        'nitpicker/no-compatibility-shim': 'error',
      },
    },
    {
      files: configFileGlobsFor(layout),
      rules: {
        'no-restricted-syntax': ['error', ...restrictedSyntax.configFile],
        ...configFileAllowances,
      },
    },
    ...frameworkFileEntries(options.frameworkDefaultExports),
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      plugins: { functional: functionalPlugin, nitpicker: nitpickerRules },
      rules: { ...domainRules, 'no-restricted-syntax': ['error', ...restrictedSyntax.domain] },
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
        'nitpicker/no-forwarding-method-alias': 'error',
        'nitpicker/no-forwarding-wrapper': 'error',
        'nitpicker/no-falsy-default': 'error',
      },
    },
    {
      files: layout.sourceGlobs,
      ignores: [...productionScope(layout).ignores, ...domainGlobsFor(layout.sourceRoots)],
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-parameter-mutation': 'error' },
    },
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { functional: functionalPlugin, nitpicker: nitpickerRules },
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
    ...productionPolicyConfigFor(layout, options),
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
