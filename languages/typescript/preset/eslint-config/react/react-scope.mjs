import { readFileSync } from 'node:fs';
import path from 'node:path';
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

const REACT_PACKAGE = 'react';
const typedRuleIds = typedReactXRules.map((name) => `react-x/${name}`);
const untypedThirdPartyRuleIds = thirdPartyReactRuleIds.filter((id) => !typedRuleIds.includes(id));

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function readManifest(projectRoot) {
  return readJson(path.join(projectRoot, 'package.json'));
}

function reactMajorOf(projectRoot) {
  const installed = readJson(path.join(projectRoot, 'node_modules/react/package.json'))?.version;
  const manifest = readManifest(projectRoot);
  const declared = manifest?.dependencies?.react ?? manifest?.devDependencies?.react;
  const major = /\d+/u.exec(typeof installed === 'string' ? installed : String(declared ?? ''));
  return major === null ? undefined : Number(major[0]);
}

function ruleIdsForReact(major) {
  const before19 = major !== undefined && major < 19;
  return untypedThirdPartyRuleIds.filter((id) => !before19 || !react19RuleIds.includes(id));
}

function readDependencyNames(projectRoot) {
  const manifest = readManifest(projectRoot);
  return [
    ...Object.keys(manifest?.dependencies ?? {}),
    ...Object.keys(manifest?.devDependencies ?? {}),
  ];
}

export function isReactProject({ projectRoot, react = {} }) {
  return react.enabled ?? readDependencyNames(projectRoot).includes(REACT_PACKAGE);
}

export function stylingApproachFor({ projectRoot, react = {} }) {
  if (react.styling !== undefined) {
    return react.styling;
  }
  return readDependencyNames(projectRoot).some((name) => cssInJsSource.test(name))
    ? 'css-in-js'
    : defaultStylingApproach;
}

export function analyzedProjectRoot(environment = process.env) {
  return environment.NITPICKER_DIFF_ESLINT_PROJECT_ROOT ?? process.cwd();
}

function productionScope(layout) {
  return {
    files: layout.sourceGlobs,
    ignores: [...layout.testGlobs, ...layout.sourceTestDirectoryGlobs],
  };
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
        ...Object.fromEntries(
          [...nitpickerReactRuleIds, ...ruleIdsForReact(react.major)].map((id) => [id, 'error']),
        ),
        ...accessibilityRuleOptions,
        'nitpicker/react-no-effect-derived-state': 'error',
        'nitpicker/react-no-effect-data-fetching': 'error',
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
  const styling = stylingApproachFor({ projectRoot, react });
  const reactNative = readDependencyNames(projectRoot).includes(reactNativeTestingPackage);
  const major = reactMajorOf(projectRoot);
  return [
    ...(await reactSyntaxConfigFor(layout, { ...react, styling, reactNative, major })),
    ...(await reactTypedConfigFor(layout)),
  ];
}
