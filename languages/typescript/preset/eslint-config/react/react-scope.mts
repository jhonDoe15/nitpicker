import type { Linter } from 'eslint';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { codeExtensions } from '../../layout.mjs';
import {
  defaultStylingApproach,
  reactNativeTestingPackage,
  reactTestRuleIds,
  restrictedBrowserGlobals,
  testingLibrarySettings,
} from './react-rules.mjs';
import {
  type ReactScope,
  type ResolvedLayout,
  type ScopeLayout,
  linterConfigs,
} from '../typed/config-types.mts';
import { domainGlobsFor } from '../typed/glob-views.mts';
import { stylingApproachFor as untypedStylingApproachFor } from './react-styling.mjs';
import { nitpickerReactRuleIds } from './rules/nitpicker-rules.mjs';
import {
  react19RuleIds,
  thirdPartyReactRuleIds,
  typedReactXRules,
} from './rules/third-party-rules.mjs';
import {
  isReactNativePackage,
  productionScope,
  reactMajorOf,
  readDependencyNames,
  storyGlobs,
  testsCleanUpAutomatically,
} from '../typed/scope-views.mts';

export { isReactProject } from '../scope-support.mjs';

const typedRuleIds = typedReactXRules.map((name) => `react-x/${name}`);
const untypedThirdPartyRuleIds = thirdPartyReactRuleIds.filter((id) => !typedRuleIds.includes(id));

const REACT_19_MAJOR = 19;

const stylingApproachFor: (input: {
  projectRoot: string;
  react: ReactScope;
  layout: ResolvedLayout | undefined;
}) => string = untypedStylingApproachFor;

function ruleIdsForReact(major: number | undefined) {
  const before19 = major !== undefined && major < REACT_19_MAJOR;
  return untypedThirdPartyRuleIds.filter((id) => !before19 || !react19RuleIds.includes(id));
}

function scannableLayout(layout: ResolvedLayout) {
  return typeof layout.projectCodeFiles === 'function' ? layout : undefined;
}

export function analyzedProjectRoot(environment: NodeJS.ProcessEnv = process.env): string {
  return environment['NITPICKER_DIFF_ESLINT_PROJECT_ROOT'] ?? process.cwd();
}

function testScope(layout: ScopeLayout) {
  return {
    files: [
      ...layout.testGlobs,
      ...layout.sourceRoots.map((root) => `${root}/**/__tests__/**/*.${codeExtensions}`),
    ],
  };
}

function reactVersionSettings(major: number | undefined) {
  return major === undefined
    ? {}
    : { settings: { 'react-x': { version: `${String(major)}.0.0` } } };
}

function platformGlobals(react: ReactScope) {
  return react.nativeApp === true ? {} : { languageOptions: { globals: globals.browser } };
}

function browserGlobalEntries(layout: ScopeLayout, react: ReactScope) {
  return react.nativeApp === true
    ? []
    : [
        {
          files: [...layout.sourceGlobs, ...testScope(layout).files],
          ignores: domainGlobsFor(layout.sourceRoots),
          rules: { 'no-restricted-globals': restrictedBrowserGlobals },
        },
      ];
}

export async function reactSyntaxConfigFor(
  layout: ScopeLayout,
  react: ReactScope = {},
): Promise<Linter.Config[]> {
  const { reactPlugins, accessibilityRuleOptions, testingLibraryPlugin } =
    await import('./react-plugins.mts');
  return linterConfigs([
    {
      ...productionScope(layout),
      ...platformGlobals(react),
      ...reactVersionSettings(react.major),
      plugins: { nitpicker: nitpickerRules, ...reactPlugins },
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        ...Object.fromEntries(
          [...nitpickerReactRuleIds, ...ruleIdsForReact(react.major)].map((id) => [id, 'error']),
        ),
        ...accessibilityRuleOptions,
        'nitpicker/no-runtime-exclusive-props-check': 'error',
        'nitpicker/react-no-effect-derived-state': 'error',
        'nitpicker/react-no-effect-data-fetching': 'error',
        'nitpicker/react-no-hardcoded-colors': 'error',
        'nitpicker/react-single-styling-approach': [
          'error',
          { approach: react.styling ?? defaultStylingApproach },
        ],
      },
    },
    {
      ...testScope(layout),
      ...platformGlobals(react),
      plugins: { nitpicker: nitpickerRules, 'testing-library': testingLibraryPlugin },
      settings: testingLibrarySettings,
      rules: {
        ...Object.fromEntries(reactTestRuleIds.map((id) => [id, 'error'])),
        ...(react.reactNative === true ? { 'testing-library/no-test-id-queries': 'off' } : {}),
        ...(react.autoCleanup === false ? { 'testing-library/no-manual-cleanup': 'off' } : {}),
      },
    },
  ]);
}

function storyConfigFor() {
  return [
    {
      files: storyGlobs,
      plugins: { nitpicker: nitpickerRules },
      rules: { 'nitpicker/react-no-hardcoded-colors': 'off' },
    },
  ];
}

async function reactTypedConfigFor(layout: ScopeLayout) {
  const { reactPlugins } = await import('./react-plugins.mts');
  return [
    {
      ...productionScope(layout),
      plugins: { '@typescript-eslint': tseslint.plugin, 'react-x': reactPlugins['react-x'] },
      rules: {
        ...Object.fromEntries(typedRuleIds.map((id) => [id, 'error'])),
        '@typescript-eslint/no-confusing-void-expression': [
          'error',
          { ignoreVoidReturningFunctions: true },
        ],
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ];
}

export async function reactScopeConfigFor(
  layout: ResolvedLayout,
  react: ReactScope = {},
  projectRoot: string = analyzedProjectRoot(),
): Promise<Linter.Config[]> {
  const dependencies = readDependencyNames(projectRoot);
  const scope = {
    ...react,
    styling: stylingApproachFor({ projectRoot, react, layout: scannableLayout(layout) }),
    reactNative: dependencies.includes(reactNativeTestingPackage),
    nativeApp: dependencies.some(isReactNativePackage),
    major: react.major ?? reactMajorOf(projectRoot),
    autoCleanup:
      typeof react.autoCleanup === 'boolean'
        ? react.autoCleanup
        : testsCleanUpAutomatically(projectRoot),
  };
  return linterConfigs([
    ...(await reactSyntaxConfigFor(layout, scope)),
    ...storyConfigFor(),
    ...(await reactTypedConfigFor(layout)),
    ...browserGlobalEntries(layout, scope),
  ]);
}
