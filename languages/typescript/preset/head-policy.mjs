import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  readHeadPolicyFile,
  resolveHeadPolicy as resolveSharedHeadPolicy,
} from '../../../shared/head-policy.mjs';
import { isJavascriptPolicy } from '../../javascript/preset/javascript-preset.mjs';
import { excludedGlobs, resolveLayout, sourceRoots, testRoots } from './layout.mjs';

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

export function resolveHeadPolicy(config = {}, projectRoot) {
  const policy = resolveSharedHeadPolicy(config);
  const prettier = policy.tools?.prettier;
  if (projectRoot === undefined || !usesProjectConfig(prettier?.precedence ?? [])) {
    return policy;
  }
  return {
    ...policy,
    tools: {
      ...policy.tools,
      prettier: { ...prettier, projectConfigDigest: projectFilesDigest(projectRoot) },
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

export function usesProjectConfig(precedence) {
  return precedence.includes('project');
}

export function prettierPrecedence(environment = process.env) {
  return readHeadPolicy(environment).tools.prettier?.precedence ?? ['nitpicker'];
}

export function readHeadPolicy(environment = process.env) {
  const policy = readHeadPolicyFile(environment);
  return {
    exclude: policy.exclude ?? [],
    layout: { ...defaultLayout, ...policy.layout },
    exceptions: policy.exceptions ?? [],
    thresholds: policy.thresholds ?? {},
    react: policy.react ?? {},
    preset: policy.preset,
    tools: policy.tools ?? {},
  };
}

export function readLayout(environment = process.env) {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayout(readHeadPolicyFile(environment).layout, policy.exclude, {
      javascript: isJavascriptPolicy(policy),
    }),
    entryPoints: policy.layout.entryPoints ?? [],
  };
}
