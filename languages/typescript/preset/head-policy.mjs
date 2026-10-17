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
  excludedGlobs,
  resolveLayout,
  resolveLayoutFor,
  sourceRoots,
  testRoots,
} from './layout.mjs';
import { stylingApproachFor } from './eslint-config/react/react-styling.mjs';
import { prettierConventionOptions } from '../conventions/prettier-conventions.mjs';
import { detectedRunnerFact } from './test-runner/detect-runner.mjs';
import { runnerTestFiles } from './test-runner/test-files/runner-test-files.mjs';
import { policyTestFiles } from './test-runner/test-files/test-file-patterns.mjs';

export { headPolicyEnvironment, withHeadPolicyFile } from '../../../shared/head-policy.mjs';

export const defaultLayout = { sourceRoots, testRoots, excludedGlobs };

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
  return {
    ...policy,
    ...(scoped ? detectedScopes(policy, projectRoot) : {}),
    ...detectedTools(policy, scoped, projectRoot),
  };
}

function testRunnerFacts(policy, projectRoot) {
  const options = { configured: policy.tools?.tests?.runner, layout: resolveLayoutFor(policy) };
  return {
    ...detectedRunnerFact(projectRoot, options),
    testFiles: runnerTestFiles(projectRoot, options),
  };
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
      ...(scopes.react.enabled ? { autoCleanup: testsCleanUpAutomatically(projectRoot) } : {}),
    },
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
    frameworks: { defaultExports: [], entryPoints: [], ...policy.frameworks },
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayout(readHeadPolicyFile(environment).layout, policy.exclude, {
      javascript: isJavascriptPolicy(policy),
      testFiles: policyTestFiles(policy.tools.tests),
    }),
    entryPoints: [...(policy.layout.entryPoints ?? []), ...policy.frameworks.entryPoints],
  };
}
