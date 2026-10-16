import globals from 'globals';
import tseslint from 'typescript-eslint';
import { nitpickerRules } from '../../eslint-plugin/index.mjs';
import { cssInJsSource } from '../../eslint-plugin/rules/react/react-single-styling-approach.mjs';
import { codeExtensions } from '../../layout.mjs';
import {
  defaultStylingApproach,
  reactNativeTestingPackage,
  reactTestRuleIds,
  testingLibrarySettings,
} from './react-rules.mjs';
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
} from '../scope-support.mjs';

export { isReactProject } from '../scope-support.mjs';

const typedRuleIds = typedReactXRules.map((name) => `react-x/${name}`);
const untypedThirdPartyRuleIds = thirdPartyReactRuleIds.filter((id) => !typedRuleIds.includes(id));

function ruleIdsForReact(major) {
  const before19 = major !== undefined && major < 19;
  return untypedThirdPartyRuleIds.filter((id) => !before19 || !react19RuleIds.includes(id));
}

function inferredStylingApproach(dependencies) {
  if (dependencies.some((name) => cssInJsSource.test(name))) {
    return 'css-in-js';
  }
  return dependencies.some(isReactNativePackage) ? 'style-sheet' : defaultStylingApproach;
}

export function stylingApproachFor({ projectRoot, react = {} }) {
  return react.styling ?? inferredStylingApproach(readDependencyNames(projectRoot));
}

export function analyzedProjectRoot(environment = process.env) {
  return environment.NITPICKER_DIFF_ESLINT_PROJECT_ROOT ?? process.cwd();
}

function testScope(layout) {
  return {
    files: [
      ...layout.testGlobs,
      ...layout.sourceRoots.map((root) => `${root}/**/__tests__/**/*.${codeExtensions}`),
    ],
  };
}

function reactVersionSettings(major) {
  return major === undefined ? {} : { settings: { 'react-x': { version: `${major}.0.0` } } };
}

function platformGlobals(react) {
  return react.nativeApp ? {} : { languageOptions: { globals: globals.browser } };
}

export async function reactSyntaxConfigFor(layout, react = {}) {
  const { reactPlugins, accessibilityRuleOptions, testingLibraryPlugin } =
    await import('./react-plugins.mjs');
  return [
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
        'nitpicker/no-singular-and-plural-prop': 'error',
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
        ...(react.reactNative ? { 'testing-library/no-test-id-queries': 'off' } : {}),
      },
    },
  ];
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

async function reactTypedConfigFor(layout) {
  const { reactPlugins } = await import('./react-plugins.mjs');
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

export async function reactScopeConfigFor(layout, react = {}, projectRoot = analyzedProjectRoot()) {
  const dependencies = readDependencyNames(projectRoot);
  const scope = {
    ...react,
    styling: stylingApproachFor({ projectRoot, react }),
    reactNative: dependencies.includes(reactNativeTestingPackage),
    nativeApp: dependencies.some(isReactNativePackage),
    major: react.major ?? reactMajorOf(projectRoot),
  };
  return [
    ...(await reactSyntaxConfigFor(layout, scope)),
    ...storyConfigFor(),
    ...(await reactTypedConfigFor(layout)),
  ];
}
