import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readHeadPolicyFile,
  resolveHeadPolicy as resolveSharedHeadPolicy,
} from '../../../shared/head-policy.mjs';
import { hasScopePackage, scopePackage } from './eslint-config/scope-support.mjs';
import { excludedGlobs, resolveLayoutFor, sourceRoots, testRoots } from './layout.mjs';
import { prettierConventionOptions } from '../conventions/prettier-conventions.mjs';

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
  const prettier = policy.tools?.prettier;
  return {
    ...policy,
    ...(SCOPED_PRESETS.includes(config.preset) ? detectedScopes(policy, projectRoot) : {}),
    ...(usesProjectConfig(prettier?.precedence ?? [])
      ? {
          tools: {
            ...policy.tools,
            prettier: { ...prettier, projectConfigDigest: projectFilesDigest(projectRoot) },
          },
        }
      : {}),
  };
}

function detectedScopes(policy, projectRoot) {
  const scopes = Object.fromEntries(
    ['react', 'i18n'].map((scope) => [
      scope,
      { ...policy[scope], enabled: policy[scope]?.enabled ?? hasScopePackage(projectRoot, scope) },
    ]),
  );
  const iconPackage = scopePackage(projectRoot, 'icons');
  return {
    ...scopes,
    react: { ...scopes.react, ...(iconPackage === undefined ? {} : { iconPackage }) },
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
    duplicates: policy.duplicates ?? {},
    conventions: policy.conventions,
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayoutFor(policy),
    entryPoints: policy.layout.entryPoints ?? [],
  };
}
