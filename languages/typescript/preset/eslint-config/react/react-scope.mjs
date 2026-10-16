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
import {
  analyzedProjectRoot,
  productionScope,
  readDependencyNames,
  storyGlobs,
} from '../scope-support.mjs';

export { analyzedProjectRoot, isReactProject } from '../scope-support.mjs';

export function stylingApproachFor({ projectRoot, react = {} }) {
  if (react.styling !== undefined) {
    return react.styling;
  }
  return readDependencyNames(projectRoot).some((name) => cssInJsSource.test(name))
    ? 'css-in-js'
    : defaultStylingApproach;
}

function testScope(layout) {
  return {
    files: [
      ...layout.testGlobs,
      ...layout.sourceRoots.map((root) => `${root}/**/__tests__/**/*.${codeExtensions}`),
    ],
  };
}

export async function reactSyntaxConfigFor(layout, react = {}) {
  const { reactPlugins, accessibilityRuleOptions, testingLibraryPlugin } =
    await import('./react-plugins.mjs');
  return [
    {
      ...productionScope(layout),
      plugins: { nitpicker: nitpickerRules, ...reactPlugins },
      rules: {
        'react-hooks/rules-of-hooks': 'error',
        'react-hooks/exhaustive-deps': 'error',
        'react-x/no-class-component': 'error',
        'react-x/no-array-index-key': 'error',
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

function reactTypedConfigFor(layout) {
  return [
    {
      ...productionScope(layout),
      plugins: { '@typescript-eslint': tseslint.plugin },
      rules: {
        '@typescript-eslint/no-misused-promises': [
          'error',
          { checksVoidReturn: { attributes: false } },
        ],
      },
    },
  ];
}

export async function reactScopeConfigFor(layout, react = {}, projectRoot = analyzedProjectRoot()) {
  const styling = stylingApproachFor({ projectRoot, react });
  const reactNative = readDependencyNames(projectRoot).includes(reactNativeTestingPackage);
  return [
    ...(await reactSyntaxConfigFor(layout, { ...react, styling, reactNative })),
    ...storyConfigFor(),
    ...reactTypedConfigFor(layout),
  ];
}
