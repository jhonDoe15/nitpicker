import functional from 'eslint-plugin-functional';
import tseslint from 'typescript-eslint';
import nitpickerRules from '../eslint-plugin/index.mjs';
import { defaultResolvedLayout } from '../layout.mjs';
import { errorWrappingPolicy } from './error-wrapping-policy.mjs';
import {
  escapeHatchLinterOptions,
  escapeHatchRules,
  escapeHatchSelectors,
} from './strict-escape-hatches.mjs';
import {
  declarationRules,
  declarationSelectors,
  defaultExportSelectors,
  typedDeclarationRules,
} from './strict-declarations.mjs';
import {
  controlFlowRules,
  controlFlowSelectors,
  controlFlowTypedRules,
  forEachSelectors,
  loopSelectors,
} from './strict-control-flow.mjs';
import {
  domainFunctionalRules,
  domainGlobsFor,
  domainRestrictedSyntax,
  domainTypeAwareFunctionalRules,
} from './strict-domain.mjs';
import {
  adapterGlobsFor,
  restrictedAdapterSyntax,
  strictAdaptersTypedConfig,
} from './strict-adapters.mjs';

// ESLint flat config replaces, not merges, a rule's options when several config objects match the
// same file. So every scope carries the full list for the files it covers: the selectors that apply
// everywhere plus the ones for that scope. Add a selector to the list of its scope here, never as a
// separate `no-restricted-syntax` entry for a narrower glob.
const everywhereSelectors = [...escapeHatchSelectors, ...declarationSelectors];
// Control flow applies to all production code except config files. `domain/` has its own, stricter
// loop and forEach selectors, so it takes only the promise-chain ones to avoid a duplicate message.
const productionSelectors = [
  ...everywhereSelectors,
  ...defaultExportSelectors,
  ...controlFlowSelectors,
];

/** The complete `no-restricted-syntax` selector list for each scope of the strict preset. */
export const restrictedSyntaxByScope = {
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

function configFileGlobsFor(layout) {
  return layout.sourceRoots.flatMap((root) => [`${root}/**/*.config.*`, `${root}/**/.*rc.*`]);
}

function productionScope(layout) {
  return { ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs] };
}

/**
 * Rules that need only the syntax tree, for one layout: they run without a TypeScript program.
 * Entries later in the array win, so `domain/` and `adapters/` follow the general entries.
 */
export function strictSyntaxConfigFor(layout = defaultResolvedLayout) {
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
        ...declarationRules,
        ...controlFlowRules,
        'no-restricted-syntax': ['error', ...restrictedSyntaxByScope.source],
      },
    },
    {
      files: configFileGlobsFor(layout),
      rules: { 'no-restricted-syntax': ['error', ...restrictedSyntaxByScope.configFile] },
    },
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      plugins: { functional, nitpicker: nitpickerRules },
      rules: {
        ...domainFunctionalRules,
        'no-restricted-syntax': ['error', ...restrictedSyntaxByScope.domain],
        'nitpicker/no-self-recursion': 'error',
        'nitpicker/no-throw': 'error',
      },
    },
    {
      files: adapterGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      plugins: { nitpicker: nitpickerRules },
      rules: {
        'no-restricted-syntax': ['error', ...restrictedSyntaxByScope.adapters],
        'no-empty': ['error', { allowEmptyCatch: false }],
        'nitpicker/no-silent-catch': 'error',
        'nitpicker/preserve-error-cause': ['error', errorWrappingPolicy],
        'nitpicker/no-handwritten-boundary-guard': 'error',
      },
    },
  ];
}

const strictSyntaxConfig = strictSyntaxConfigFor();

export default strictSyntaxConfig;

/**
 * Rules that need type information, for one layout. `parserOptions` is how typescript-eslint finds
 * the program, for example `{ project: './tsconfig.quality.json', tsconfigRootDir }`.
 */
export function strictTypedConfigFor(layout, parserOptions) {
  return [
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: { ...typedDeclarationRules, ...controlFlowTypedRules },
    },
    {
      files: domainGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
      languageOptions: { parser: tseslint.parser, parserOptions },
      plugins: { functional },
      rules: domainTypeAwareFunctionalRules,
    },
    ...strictAdaptersTypedConfig.map((entry) => ({
      ...entry,
      files: adapterGlobsFor(layout.sourceRoots),
      ...productionScope(layout),
    })),
  ];
}

export function strictTypedConfig(parserOptions) {
  return strictTypedConfigFor(defaultResolvedLayout, parserOptions);
}

export function strictConfig(parserOptions) {
  return [...strictSyntaxConfig, ...strictTypedConfig(parserOptions)];
}

/** Everything the strict preset adds to the project's own ESLint config, for one layout. */
export function strictPresetConfig(layout, parserOptions) {
  return [
    ...strictSyntaxConfigFor(layout),
    ...strictTypedConfigFor(layout, parserOptions),
    {
      files: layout.sourceGlobs,
      ...productionScope(layout),
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/no-module-level-let': 'error' },
    },
  ];
}
