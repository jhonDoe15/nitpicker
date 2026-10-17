import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readHeadPolicyFile,
  resolveHeadPolicy as resolveSharedHeadPolicy,
} from '../../../shared/head-policy.mjs';
import { isJavascriptPolicy } from '../../javascript/preset/javascript-preset.mjs';
import {
  frameworkConventions,
  hasScopePackage,
  reactMajorOf,
  scopePackage,
  testsCleanUpAutomatically,
} from './eslint-config/scope-support.mjs';
import {
  builtInExcludedGlobs,
  resolveLayout,
  resolveLayoutFor,
  sourceRoots,
  testRoots,
} from './layout.mjs';
import { stylingApproachFor } from './eslint-config/react/react-styling.mjs';
import { prettierConventionOptions } from '../conventions/prettier-conventions.mjs';
import { markedGeneratedFiles } from './layout/generated-files.mjs';
import { detectedRunnerFact, runnerChoiceNotices } from './test-runner/detect-runner.mjs';
import { runnerTypesNotices } from './test-runner/runner-types.mjs';
import { runnerTestFileFacts } from './test-runner/test-files/runner-test-files.mjs';
import { policyTestFiles } from './test-runner/test-files/test-file-patterns.mjs';

export { headPolicyEnvironment, withHeadPolicyFile } from '../../../shared/head-policy.mjs';

export const defaultLayout = { sourceRoots, testRoots, excludedGlobs: builtInExcludedGlobs };

const PRETTIER_PROJECT_FILES = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  '.prettierrc.cts',
  '.prettierrc.mts',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
  'prettier.config.cts',
  'prettier.config.mts',
  '.prettierignore',
  '.editorconfig',
  'package.json',
];

const SCOPED_PRESETS = [undefined, 'typescript', 'javascript'];

export function resolveHeadPolicy(config = {}, projectRoot) {
  const policy = resolveSharedHeadPolicy(config);
  return projectRoot === undefined ? policy : withProjectFacts(policy, config, projectRoot);
}

function withProjectFacts(policy, config, projectRoot) {
  const scoped = SCOPED_PRESETS.includes(config.preset);
  const withScopes = { ...policy, ...(scoped ? withDetectedScopes(policy, projectRoot) : {}) };
  const withTools = { ...withScopes, ...detectedTools(withScopes, scoped, projectRoot) };
  return withTools.react?.enabled === true && scoped
    ? withAutoCleanup(withTools, projectRoot)
    : withTools;
}

function withAutoCleanup(policy, projectRoot) {
  const tests = policy.tools.tests;
  const runner = tests.runner ?? tests.detectedRunner;
  return {
    ...policy,
    react: { ...policy.react, autoCleanup: testsCleanUpAutomatically(projectRoot, runner) },
  };
}

function testRunnerFacts(policy, projectRoot) {
  const options = { configured: policy.tools?.tests?.runner, layout: resolveLayoutFor(policy) };
  return detectedRunnerFact(projectRoot, options);
}

function usesPresetAnalyzers(analyzers) {
  return analyzers.some((analyzer) => analyzer.policyFromPackage === true);
}

export function withProjectTestFiles(policy, { projectRoot, liveProjectRoot, analyzers }) {
  const tests = policy.tools?.tests;
  if (tests === undefined || !usesPresetAnalyzers(analyzers)) {
    return policy;
  }
  const choice = runnerChoiceNotices(tests, analyzers);
  const facts = runnerTestFileFacts(projectRoot, {
    configured: tests.runner ?? tests.detectedRunner,
    layout: resolveLayoutFor(policy),
    liveProjectRoot,
  });
  const notices = [
    ...choice,
    ...(facts.notices ?? []),
    ...runnerTypesNotices(tests.runner ?? tests.detectedRunner, {
      projectDirectory: projectRoot,
      analyzers,
    }),
  ];
  const recorded = {
    ...tests,
    testFiles: facts.testFiles,
    ...(facts.domEnvironment === true ? { domEnvironment: true } : {}),
    ...(notices.length === 0 ? {} : { notices }),
  };
  return { ...policy, tools: { ...policy.tools, tests: recorded } };
}

function detectedTools(policy, scoped, projectRoot) {
  const prettier = policy.tools?.prettier;
  const facts = {
    ...(scoped
      ? {
          tests: {
            ...policy.tools?.tests,
            ...testRunnerFacts(policy, projectRoot),
          },
        }
      : {}),
    ...(usesProjectConfig(prettier?.precedence ?? [])
      ? { prettier: { ...prettier, projectConfigDigest: projectFilesDigest(projectRoot) } }
      : {}),
  };
  return Object.keys(facts).length === 0 ? {} : { tools: { ...policy.tools, ...facts } };
}

function withDetectedScopes(policy, projectRoot) {
  const generatedFiles = markedGeneratedFiles(projectRoot);
  return { generatedFiles, ...detectedScopes({ ...policy, generatedFiles }, projectRoot) };
}

function detectedScopes(policy, projectRoot) {
  const scopes = Object.fromEntries(
    ['react', 'i18n'].map((scope) => [
      scope,
      { ...policy[scope], enabled: policy[scope]?.enabled ?? hasScopePackage(projectRoot, scope) },
    ]),
  );
  const iconPackage = scopePackage(projectRoot, 'icons');
  const major = scopes.react.enabled ? reactMajorOf(projectRoot) : undefined;
  const styling = scopes.react.enabled
    ? stylingApproachFor({ projectRoot, react: scopes.react, layout: resolveLayoutFor(policy) })
    : undefined;
  const frameworks = frameworkConventions(projectRoot);
  const detected = frameworks.defaultExports.length + frameworks.entryPoints.length > 0;
  return {
    ...scopes,
    ...(detected ? { frameworks } : {}),
    react: {
      ...scopes.react,
      ...(iconPackage === undefined ? {} : { iconPackage }),
      ...(major === undefined ? {} : { major }),
      ...(styling === undefined ? {} : { styling }),
    },
  };
}

const HEAD_CHECKOUT_FACTS = ['conventions', 'generatedFiles', 'frameworks'];
const SCOPE_FACTS = [
  ['react', ['enabled', 'iconPackage', 'major', 'styling', 'autoCleanup']],
  ['i18n', ['enabled']],
];

function picked(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

function headPrettierDigest(policy, headPolicy) {
  const digest = headPolicy.tools?.prettier?.projectConfigDigest;
  const prettier = policy.tools?.prettier;
  return digest === undefined || !usesProjectConfig(prettier?.precedence ?? [])
    ? {}
    : { tools: { ...policy.tools, prettier: { ...prettier, projectConfigDigest: digest } } };
}

export function withHeadCheckoutFacts(policy, headPolicy = {}) {
  return {
    ...policy,
    ...picked(headPolicy, HEAD_CHECKOUT_FACTS),
    ...Object.fromEntries(
      SCOPE_FACTS.filter(([scope]) => headPolicy[scope] !== undefined).map(([scope, keys]) => [
        scope,
        { ...policy[scope], ...picked(headPolicy[scope], keys) },
      ]),
    ),
    ...headPrettierDigest(policy, headPolicy),
  };
}

function projectFilesDigest(projectRoot) {
  const hash = createHash('sha256');
  for (const name of PRETTIER_PROJECT_FILES) {
    const filePath = path.join(projectRoot, name);
    hash.update(`${name}\0${existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''}\0`);
  }
  return hash.digest('hex');
}

function usesProjectConfig(precedence) {
  return precedence.includes('project');
}

export function typecheckEngine(environment = process.env) {
  return readHeadPolicy(environment).tools.typescript?.engine ?? 'native';
}

export function prettierPrecedence(environment = process.env) {
  return readHeadPolicy(environment).tools.prettier?.precedence ?? ['nitpicker'];
}

export function usesLayeredPrettier(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return (
    usesProjectConfig(policy.tools.prettier?.precedence ?? []) ||
    Object.keys(prettierConventionOptions(policy.conventions)).length > 0
  );
}

export function readHeadPolicy(environment = process.env) {
  const policy = readHeadPolicyFile(environment);
  return {
    exclude: policy.exclude ?? [],
    layout: { ...defaultLayout, ...policy.layout },
    exceptions: policy.exceptions ?? [],
    thresholds: policy.thresholds ?? {},
    react: policy.react ?? {},
    i18n: policy.i18n ?? {},
    preset: policy.preset,
    tools: policy.tools ?? {},
    conventions: policy.conventions,
    generatedFiles: policy.generatedFiles ?? [],
    frameworks: { defaultExports: [], entryPoints: [], ...policy.frameworks },
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayout(readHeadPolicyFile(environment).layout, policy.exclude, {
      javascript: isJavascriptPolicy(policy),
      generatedFiles: policy.generatedFiles,
      testFiles: policyTestFiles(policy.tools.tests),
    }),
    entryPoints: [...(policy.layout.entryPoints ?? []), ...policy.frameworks.entryPoints],
  };
}
