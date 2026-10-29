import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveJscpdPolicy } from '../../../core/tooling/jscpd/config.mjs';
import {
  readHeadPolicyFile,
  resolveHeadPolicy as resolveSharedHeadPolicy,
} from '../../../shared/head-policy.mjs';
import {
  frameworkConventions,
  hasScopePackage,
  reactMajorOf,
  scopePackage,
  testsCleanUpAutomatically,
} from './eslint-config/scope-support.mjs';
import {
  builtInExcludedGlobs,
  existingRoots,
  globMatcher,
  resolveLayout,
  resolveLayoutFor,
  sourceRoots,
  testRoots,
} from './layout.mjs';
import { detectLibraries } from './libraries/project-libraries.mjs';
import { stylingApproachFor } from './eslint-config/react/react-styling.mjs';
import { hasPrettierConventions } from '../conventions/prettier-conventions.mjs';
import { markedGeneratedFiles } from './layout/generated-files.mjs';
import { headToolConfigFacts, withHeadToolConfigs } from './project-configs/head-tool-configs.mjs';

export { headPolicyEnvironment, withHeadPolicyFile } from '../../../shared/head-policy.mjs';

export const defaultLayout = { sourceRoots, testRoots, excludedGlobs: builtInExcludedGlobs };

export const PRETTIER_PROJECT_FILES = [
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

function withTestPlacement(policy, projectRoot) {
  if (
    projectRoot === undefined ||
    existingRoots(projectRoot, resolveLayout(policy.layout).testRoots).length > 0
  ) {
    return policy;
  }
  return { ...policy, layout: { ...policy.layout, colocatedTests: true } };
}

const SCOPED_PRESETS = [undefined, 'typescript', 'javascript'];

export function resolveHeadPolicy(config = {}, projectRoot) {
  const policy = withTestPlacement(resolveSharedHeadPolicy(config), projectRoot);
  return projectRoot === undefined ? policy : withProjectFacts(policy, config, projectRoot);
}

function withProjectFacts(policy, config, projectRoot) {
  const prettier = policy.tools?.prettier;
  const jscpd = resolveJscpdPolicy(policy.tools?.jscpd, projectRoot);
  const tools =
    policy.tools === undefined
      ? undefined
      : {
          ...withHeadToolConfigs(policy.tools, projectRoot),
          ...(jscpd === undefined ? {} : { jscpd }),
        };
  return {
    ...policy,
    ...(tools === undefined ? {} : { tools }),
    ...(SCOPED_PRESETS.includes(config.preset)
      ? {
          ...withDetectedScopes(policy, projectRoot),
          libraries: detectLibraries(projectRoot, excludedPathMatcher(policy)),
        }
      : {}),
    ...(usesProjectConfig(prettier?.precedence ?? [])
      ? {
          tools: {
            ...tools,
            prettier: { ...prettier, projectConfigDigest: projectFilesDigest(projectRoot) },
          },
        }
      : {}),
  };
}

function excludedPathMatcher(policy) {
  const matchers = resolveLayoutFor(policy).excludedGlobs.map(globMatcher);
  return (file) => matchers.some((matcher) => matcher.test(file));
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
      ...(scopes.react.enabled ? { autoCleanup: testsCleanUpAutomatically(projectRoot) } : {}),
    },
  };
}

const HEAD_CHECKOUT_FACTS = [
  'conventions',
  'conventionPins',
  'generatedFiles',
  'frameworks',
  'libraries',
  'spring',
  'kotlin',
];
const SCOPE_FACTS = [
  ['react', ['enabled', 'iconPackage', 'major', 'styling', 'autoCleanup']],
  ['i18n', ['enabled']],
];

function picked(source, keys) {
  return Object.fromEntries(
    keys.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
  );
}

function headJscpdFacts(settings, headSettings = {}) {
  if (headSettings.projectConfig === undefined) {
    return { ...headSettings, precedence: headSettings.precedence ?? ['nitpicker'] };
  }
  return { ...settings, ...picked(headSettings, ['projectConfig', 'projectConfigDigest']) };
}

function headToolFacts(policy, headPolicy) {
  const tools = { ...policy.tools };
  if (usesProjectConfig(tools.prettier?.precedence ?? [])) {
    tools.prettier = {
      ...tools.prettier,
      ...picked(headPolicy.tools?.prettier ?? {}, ['projectConfigDigest']),
    };
  }
  if (usesProjectConfig(tools.jscpd?.precedence ?? [])) {
    tools.jscpd = headJscpdFacts(tools.jscpd, headPolicy.tools?.jscpd);
  }
  return policy.tools === undefined ? {} : { tools };
}

function headTestPlacement(policy, headPolicy) {
  return headPolicy.layout?.colocatedTests === true
    ? { layout: { ...policy.layout, colocatedTests: true } }
    : {};
}

export function withHeadCheckoutFacts(basePolicy, headPolicy = {}) {
  const policy =
    basePolicy.tools === undefined
      ? basePolicy
      : { ...basePolicy, tools: headToolConfigFacts(basePolicy.tools, headPolicy.tools) };
  return {
    ...policy,
    ...headTestPlacement(policy, headPolicy),
    ...picked(headPolicy, HEAD_CHECKOUT_FACTS),
    ...Object.fromEntries(
      SCOPE_FACTS.filter(([scope]) => headPolicy[scope] !== undefined).map(([scope, keys]) => [
        scope,
        { ...policy[scope], ...picked(headPolicy[scope], keys) },
      ]),
    ),
    ...headToolFacts(policy, headPolicy),
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
    hasPrettierConventions(policy.conventions)
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
    duplicates: policy.duplicates ?? {},
    conventions: policy.conventions,
    testConsole: policy.testConsole ?? {},
    conventionPins: policy.conventionPins,
    generatedFiles: policy.generatedFiles ?? [],
    libraries: policy.libraries,
    frameworks: { defaultExports: [], entryPoints: [], ...policy.frameworks },
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayoutFor({ ...policy, layout: readHeadPolicyFile(environment).layout }),
    entryPoints: [...(policy.layout.entryPoints ?? []), ...policy.frameworks.entryPoints],
  };
}
