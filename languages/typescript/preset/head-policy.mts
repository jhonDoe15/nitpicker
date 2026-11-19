import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  builtInExcludedGlobs,
  existingRoots,
  resolveLayout,
  resolveLayoutFor,
  sourceRoots,
  testRoots,
} from './layout.mts';
import { detectLibraries } from './libraries/project-libraries.mts';
import { hasPrettierConventions } from '../conventions/prettier-conventions.mts';
import { withDetectedScopes } from './typed/detected-scopes.mts';
import { withTestRunnerFacts } from './test-runner/detect-runner.mts';
import {
  headToolConfigs,
  jscpdPolicy,
  matcherOf,
  picked,
  readPolicyFile,
  readPolicySource,
  resolveSharedPolicy,
} from './typed/head-policy-views.mts';
import { optionalText, textsOf } from '../../../shared/values/readers.mts';
import type { Environment } from '../../../shared/processes/environment.mts';
import { projectConfigTools } from './project-tools/project-config-files.mts';
import { headCapturedFacts, withProjectToolConfigs } from './project-tools/project-tool-policy.mts';
import { eslintProjectFacts } from './eslint-project/project-config.mts';
import type {
  HeadConfig,
  HeadLayout,
  HeadPolicy,
  HeadPolicyFile,
  ToolSettings,
  ToolSettingsMap,
} from './typed/head-policy-types.mts';

type Fields = Readonly<Record<string, unknown>>;
type ToolRecord = Record<string, ToolSettings | undefined>;
type FileMatcher = (file: string) => boolean;

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

function withTestPlacement(
  policy: HeadPolicyFile,
  projectRoot: string | undefined,
): HeadPolicyFile {
  if (
    projectRoot === undefined ||
    existingRoots(projectRoot, resolveLayout(policy.layout).testRoots).length > 0
  ) {
    return policy;
  }
  return { ...policy, layout: { ...policy.layout, colocatedTests: true } };
}

const SCOPED_PRESETS = [undefined, 'typescript', 'javascript'];

export function resolveHeadPolicy(config: HeadConfig = {}, projectRoot?: string): HeadPolicyFile {
  const policy = withTestPlacement(resolveSharedPolicy(config), projectRoot);
  return projectRoot === undefined ? policy : withProjectFacts(policy, config, projectRoot);
}

function withProjectFacts(
  policy: HeadPolicyFile,
  config: HeadConfig,
  projectRoot: string,
): HeadPolicyFile {
  const scoped = SCOPED_PRESETS.includes(optionalText(config['preset']));
  const disabled = config['disable'];
  const jscpd = jscpdPolicy(policy.tools?.jscpd, projectRoot);
  const tools = withProjectToolConfigs(
    headToolConfigs(
      jscpd === undefined ? policy.tools : { ...policy.tools, jscpd },
      { policy, config },
      projectRoot,
    ),
    projectRoot,
    Array.isArray(disabled) ? { disabled: textsOf(disabled) } : {},
  );
  const withScopes = {
    ...policy,
    ...(scoped
      ? {
          ...withDetectedScopes(policy, projectRoot),
          libraries: detectLibraries(projectRoot, excludedPathMatcher(policy)),
        }
      : {}),
    ...(tools === undefined ? {} : { tools: withToolFacts(tools, projectRoot) }),
  };
  return scoped
    ? withTestRunnerFacts(withScopes, projectRoot, resolveLayoutFor(withScopes))
    : withScopes;
}

function withToolFacts(tools: ToolSettingsMap, projectRoot: string): ToolSettingsMap {
  const { prettier, eslint } = tools;
  return {
    ...tools,
    ...(usesProjectConfig(prettier?.precedence ?? [])
      ? { prettier: { ...prettier, projectConfigDigest: projectFilesDigest(projectRoot) } }
      : {}),
    ...(usesProjectConfig(eslint?.precedence ?? [])
      ? { eslint: { ...eslint, ...eslintProjectFacts(projectRoot) } }
      : {}),
  };
}

function excludedPathMatcher(policy: HeadPolicyFile): FileMatcher {
  const matchers = resolveLayoutFor(policy).excludedGlobs.map(matcherOf);
  return (file) => matchers.some((matcher) => matcher.test(file));
}

const HEAD_CHECKOUT_FACTS = [
  'conventions',
  'conventionPins',
  'generatedFiles',
  'frameworks',
  'libraries',
  'spring',
  'featureFolders',
  'kotlin',
];
const SCOPE_FACTS = [
  ['react', ['enabled', 'iconPackage', 'major', 'styling', 'autoCleanup']],
  ['i18n', ['enabled']],
] as const;

function withoutKeys(source: ToolSettings, keys: readonly string[]): Fields {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !keys.includes(key)));
}

const HEAD_TOOL_FACTS = [
  ['prettier', ['projectConfigDigest']],
  ['eslint', ['projectConfigFile', 'projectConfigDigest', 'projectConfigMissing']],
] as const;

function headToolFacts(policy: HeadPolicyFile, headPolicy: HeadPolicyFile): HeadPolicyFile {
  if (policy.tools === undefined) {
    return {};
  }
  const tools: ToolRecord = { ...policy.tools };
  for (const [tool, keys] of HEAD_TOOL_FACTS) {
    const current = tools[tool];
    if (current !== undefined && usesProjectConfig(current.precedence ?? [])) {
      tools[tool] = {
        ...withoutKeys(current, keys),
        ...picked(headPolicy.tools?.[tool] ?? {}, keys),
      };
    }
  }
  for (const tool of ['jscpd', 'stryker', 'typescript', 'tests', ...projectConfigTools()]) {
    if (usesProjectConfig(tools[tool]?.precedence ?? [])) {
      tools[tool] = headCapturedFacts(tools[tool], headPolicy.tools?.[tool]);
    }
  }
  return { tools };
}

function headTestPlacement(policy: HeadPolicyFile, headPolicy: HeadPolicyFile): HeadPolicyFile {
  return headPolicy.layout?.colocatedTests === true
    ? { layout: { ...policy.layout, colocatedTests: true } }
    : {};
}

export function withHeadCheckoutFacts(
  policy: HeadPolicyFile,
  headPolicy: HeadPolicyFile = {},
): HeadPolicyFile {
  return {
    ...policy,
    ...headTestPlacement(policy, headPolicy),
    ...picked(headPolicy, HEAD_CHECKOUT_FACTS),
    ...Object.fromEntries(
      SCOPE_FACTS.filter(([scope]) => headPolicy[scope] !== undefined).map(([scope, keys]) => [
        scope,
        { ...policy[scope], ...picked(headPolicy[scope] ?? {}, keys) },
      ]),
    ),
    ...headToolFacts(policy, headPolicy),
  };
}

function projectFilesDigest(projectRoot: string): string {
  const hash = createHash('sha256');
  for (const name of PRETTIER_PROJECT_FILES) {
    const filePath = path.join(projectRoot, name);
    hash.update(`${name}\0${existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''}\0`);
  }
  return hash.digest('hex');
}

function usesProjectConfig(precedence: readonly string[]): boolean {
  return precedence.includes('project');
}

export function typecheckEngine(environment: Environment = process.env): string {
  return readHeadPolicy(environment).tools.typescript?.engine ?? 'native';
}

export function prettierPrecedence(environment: Environment = process.env): readonly string[] {
  return readHeadPolicy(environment).tools.prettier?.precedence ?? ['nitpicker'];
}

export function usesLayeredPrettier(environment: Environment = process.env): boolean {
  const policy = readHeadPolicy(environment);
  return (
    usesProjectConfig(policy.tools.prettier?.precedence ?? []) ||
    hasPrettierConventions(policy.conventions)
  );
}

export function readHeadPolicy(environment: Environment = process.env): HeadPolicy {
  const policy = readPolicyFile(environment);
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
    history: policy.history ?? {},
    ...(policy.protocols === undefined ? {} : { protocols: policy.protocols }),
  };
}

function lastResolved(): (key: string, resolve: () => HeadLayout) => HeadLayout {
  const resolved = new Map<string, HeadLayout>();
  return (key, resolve) => {
    const known = resolved.get(key);
    if (known !== undefined) {
      return known;
    }
    resolved.clear();
    const created = resolve();
    resolved.set(key, created);
    return created;
  };
}

const layoutForPolicy = lastResolved();

export function readLayout(environment: Environment = process.env): HeadLayout {
  const { policyFile, text } = readPolicySource(environment);
  return layoutForPolicy(JSON.stringify([policyFile, text]), () => resolvedLayout(environment));
}

function resolvedLayout(environment: Environment): HeadLayout {
  const policy = readHeadPolicy(environment);
  return {
    ...resolveLayoutFor({ ...policy, layout: readPolicyFile(environment).layout }),
    entryPoints: [...(policy.layout.entryPoints ?? []), ...policy.frameworks.entryPoints],
  };
}
