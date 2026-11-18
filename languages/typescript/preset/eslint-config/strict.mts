import type { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  type ParserOptions,
  type RestrictedSyntax,
  type ScopeLayout,
  type StrictOptions,
  linterConfigs,
} from './typed/config-types.mts';
import { nitpickerRules } from '../eslint-plugin/index.mts';
import { functionalPlugin } from '../eslint-plugin/type-identity/functional-plugin.mts';
import { defaultResolvedLayout } from '../layout.mjs';
import { errorWrappingPolicy } from './policies/error-wrapping-policy.mts';
import { nestSelectors } from './nest/nest-forms.mts';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectors,
  nullSelectorsFor,
} from './strict/strict-escape-hatches.mts';
import {
  declarationSelectorsFor,
  defaultExportSelectors,
  moduleSurfaceSelectors,
  typeDefinitionSelectors,
  typedDeclarationRules,
} from './strict/strict-declarations.mts';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
  forEachSelectors,
  loopSelectors,
} from './strict/strict-control-flow.mts';
import {
  domainFunctionalRules,
  domainPurityRules,
  domainRestrictedSyntax,
  domainTypeAwareFunctionalRules,
} from './strict/strict-domain.mts';
import {
  adapterGlobsFor,
  restrictedAdapterSyntax,
  strictAdaptersTypedConfig,
} from './strict-adapters.mts';
import { atomicUpdateConfigFor } from './concurrency/atomic-updates.mts';
import { strictTestConfigFor } from './strict-tests.mts';
import { configFileGlobsFor, domainGlobsFor, testAreaGlobsFor } from './typed/glob-views.mts';
import { truthinessRules } from './truthiness/truthiness-rules.mts';
import { productionPolicyConfigFor } from './policy/production-policy.mts';

function everywhereSelectorsFor(options: StrictOptions) {
  return [...escapeHatchSelectors, ...declarationSelectorsFor(options)];
}

function productionSelectorsFor(options: StrictOptions) {
  return [
    ...everywhereSelectorsFor(options),
    ...typeDefinitionSelectors,
    ...moduleSurfaceSelectors,
    ...controlFlowSelectors,
    ...(options.nest === true ? nestSelectors : []),
  ];
}

export function restrictedSyntaxFor(options: StrictOptions = {}): RestrictedSyntax {
  const productionSelectors = productionSelectorsFor(options);
  return {
    configFile: everywhereSelectorsFor(options),
    source: productionSelectors,
    domain: [
      ...productionSelectorsFor({ ...options, nest: undefined }).filter(
        (selector) => ![...loopSelectors, ...forEachSelectors].includes(selector),
      ),
      ...domainRestrictedSyntax,
    ],
    adapters: [...productionSelectors, ...restrictedAdapterSyntax],
  };
}

export const restrictedSyntaxByScope = restrictedSyntaxFor();

function productionScope(layout: ScopeLayout) {
  return { ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs] };
}

function sourceSyntaxBans(options: StrictOptions) {
  return {
    'nitpicker/no-default-export': ['error', ...defaultExportSelectors],
    'nitpicker/no-null': ['error', ...nullSelectorsFor(options)],
  };
}

const configFileAllowances = {
  'nitpicker/no-default-export': 'off',
  'nitpicker/no-promise-chain': 'off',
};

function frameworkFileEntries(files: readonly string[] = []): object[] {
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

const productionSourceRules = {
  'nitpicker/no-boolean-flag-parameter': 'error',
  'nitpicker/no-self-recursion': 'error',
  'nitpicker/no-cleanup-skipped-on-failure': 'error',
  'nitpicker/no-task-outliving-resource': 'error',
  'nitpicker/settle-pending-on-close': 'error',
  'nitpicker/release-listeners-on-close': 'error',
  'nitpicker/no-add-only-collection': 'error',
  'nitpicker/no-per-call-debounce': 'error',
  'nitpicker/no-uncleared-timeout': 'error',
  'nitpicker/no-per-call-registration': 'error',
  'nitpicker/no-tri-state-boolean': 'error',
  'nitpicker/no-unhandled-url-parse': 'error',
  'nitpicker/reusable-object-per-call': 'error',
  'nitpicker/no-compatibility-shim': 'error',
  'nitpicker/untested-round-trip': 'error',
};

export function strictSyntaxConfigFor(
  layout: ScopeLayout = defaultResolvedLayout,
  options: StrictOptions = {},
): Linter.Config[] {
  const restrictedSyntax = restrictedSyntaxFor(options);
  return linterConfigs([
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
        ...productionSourceRules,
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
  ]);
}

export const strictSyntaxConfig: Linter.Config[] = strictSyntaxConfigFor();

function typedProductionRules(layout: ScopeLayout, options: StrictOptions) {
  return {
    ...typedDeclarationRules,
    ...controlFlowTypedRules,
    'nitpicker/no-unhandled-void-promise': [
      'error',
      { runners: options.detachedWorkRunners ?? [] },
    ],
    'nitpicker/no-cached-rejection': 'error',
    'nitpicker/exhaustive-union-predicate': 'error',
    'nitpicker/no-forwarding-method-alias': 'error',
    'nitpicker/no-forwarding-wrapper': 'error',
    'nitpicker/no-service-locator': ['error', { entryPoints: layout.entryPoints ?? [] }],
    'nitpicker/no-falsy-default': 'error',
    'nitpicker/no-string-as-regex': 'error',
    'nitpicker/no-unmapped-exception': 'error',
  };
}

const booleanLogicRules: Linter.RulesRecord = {
  'nitpicker/simpler-boolean-logic': 'error',
  'nitpicker/shorter-boolean-logic': 'error',
};

function strictTypedConfigFor(
  layout: ScopeLayout,
  parserOptions: ParserOptions,
  options: StrictOptions = {},
): Linter.Config[] {
  return linterConfigs([
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { '@typescript-eslint': tseslint.plugin, nitpicker: nitpickerRules },
      rules: typedProductionRules(layout, options),
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
    {
      files: [...layout.sourceGlobs, ...testAreaGlobsFor(layout)],
      ignores: layout.excludedGlobs,
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { nitpicker: nitpickerRules },
      rules: { ...truthinessRules, ...booleanLogicRules },
    },
    {
      files: testAreaGlobsFor(layout),
      ignores: layout.excludedGlobs,
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-dropped-test-callback': 'error' },
    },
    ...strictAdaptersTypedConfig.map((entry) => ({
      ...entry,
      files: adapterGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
    })),
  ]);
}

function strictTypedConfig(parserOptions: ParserOptions) {
  return strictTypedConfigFor(defaultResolvedLayout, parserOptions);
}

export function strictConfig(parserOptions: ParserOptions): Linter.Config[] {
  return [...strictSyntaxConfig, ...strictTypedConfig(parserOptions)];
}

export const strictProductionRules = {
  'nitpicker/no-branch-in-composition-root': 'error',
  'nitpicker/no-eager-relation': 'error',
  'nitpicker/no-many-to-many-cascade-remove': 'error',
  'nitpicker/no-module-level-let': 'error',
  'nitpicker/no-shared-stateful-regex': 'error',
  'nitpicker/no-singular-and-plural-prop': 'error',
  'nitpicker/no-unbounded-query-array': 'error',
  'nitpicker/no-undefined-only-env-check': 'error',
  'nitpicker/no-uninjectable-delay': 'error',
  'nitpicker/no-unordered-query': 'error',
  'nitpicker/no-unvalidated-schema-field': 'error',
};

export function strictPresetConfig(
  layout: typeof defaultResolvedLayout,
  parserOptions: ParserOptions,
  options: StrictOptions = {},
): Linter.Config[] {
  const scope: ScopeLayout = layout;
  return linterConfigs([
    ...productionPolicyConfigFor(layout, options),
    ...strictSyntaxConfigFor(layout, options),
    ...strictTypedConfigFor(layout, parserOptions, options),
    {
      files: scope.sourceGlobs,
      ...productionScope(scope),
      plugins: { nitpicker: nitpickerRules },
      rules: strictProductionRules,
    },
    atomicUpdateConfigFor(layout),
    ...strictTestConfigFor(layout),
  ]);
}
