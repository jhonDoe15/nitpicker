import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const DEFAULT_SOURCE_ROOT = 'src';
const DEFAULT_TEST_ROOTS = new Set(['test', 'tests']);
const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

export function expandLayoutRoots(entries, layout) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (first === DEFAULT_SOURCE_ROOT) {
      return layout.sourceRoots.map((root) => `${root}${suffix}`);
    }
    if (DEFAULT_TEST_ROOTS.has(first)) {
      return layout.testRoots.map((root) => `${root}${suffix}`);
    }
    return [entry];
  });
  return [...new Set(expanded)];
}

export function isCustomLayout(layout) {
  return (
    JSON.stringify([layout.sourceRoots, layout.testRoots]) !==
      JSON.stringify([[DEFAULT_SOURCE_ROOT], [...DEFAULT_TEST_ROOTS]]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0
  );
}

export function layoutTsconfig(base, layout) {
  return {
    ...base,
    include: expandLayoutRoots(base.include, layout),
    exclude: [...base.exclude, ...layout.exclude],
  };
}

export function layoutKnipConfig(base, layout) {
  return {
    ...base,
    entry: [...expandLayoutRoots(base.entry, layout), ...(layout.entryPoints ?? [])],
    project: expandLayoutRoots(base.project, layout),
    ignore: [...expandLayoutRoots(base.ignore, layout), ...layout.exclude],
  };
}

export function layoutJscpdConfig(base, layout) {
  return {
    ...base,
    path: expandLayoutRoots(base.path, layout),
    ignore: [...base.ignore, ...layout.exclude],
  };
}

export function jsonTransform(rewrite, layout) {
  if (!isCustomLayout(layout)) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(JSON.parse(text), layout), null, 2)}\n`;
}

const REWRITES = new Map([
  ['tsconfig.quality.json', layoutTsconfig],
  [STRYKER_TSCONFIG, layoutTsconfig],
  ['knip.json', layoutKnipConfig],
  ['jscpd.json', layoutJscpdConfig],
]);

const TSCONFIG_POLICY_FILES = new Set(['tsconfig.quality.json', STRYKER_TSCONFIG]);

export function layoutTransformFor(policyFileName, layout, { strictMutants = true } = {}) {
  const name = policyFileName.split('/').at(-1);
  const rewrite = REWRITES.get(name);
  const layoutTransform = rewrite === undefined ? undefined : jsonTransform(rewrite, layout);
  if (!TSCONFIG_POLICY_FILES.has(name)) {
    return layoutTransform;
  }
  const relaxesMutants = name === STRYKER_TSCONFIG && !strictMutants;
  return (text, targetPath) => {
    const projectDirectory = path.dirname(targetPath);
    if (existsSync(path.join(projectDirectory, PROJECT_TSCONFIG))) {
      const extended = projectBaseTsconfig(projectDirectory, layout);
      const layered =
        name === STRYKER_TSCONFIG
          ? projectLayeredMutationTsconfig(extended, strictMutants)
          : projectLayeredTsconfig(extended, JSON.parse(text), layout);
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const rewritten = layoutTransform?.(text) ?? text;
    return relaxesMutants ? withoutMutantStrictness(rewritten) : rewritten;
  };
}

function withoutMutantStrictness(text) {
  const config = JSON.parse(text);
  const compilerOptions = Object.fromEntries(
    Object.entries(config.compilerOptions).filter(
      ([option]) => !MUTANT_STRICTNESS_OPTIONS.has(option),
    ),
  );
  return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
}

const PROJECT_TSCONFIG = 'tsconfig.json';
const MUTANT_STRICTNESS_OPTIONS = new Set([
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
]);

const POLICY_COMPILER_OPTIONS = {
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  noImplicitThis: true,
  useUnknownInCatchVariables: true,
  alwaysStrict: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  noUncheckedIndexedAccess: true,
  forceConsistentCasingInFileNames: true,
};

const NO_EMIT_ANALYSIS_OPTIONS = { noEmit: true, skipLibCheck: true };

function readJsonc(file) {
  const typescript = createRequire(import.meta.url)('typescript');
  const { config } = typescript.readConfigFile(file, typescript.sys.readFile);
  return config;
}

function referencedConfigFile(projectDirectory, reference) {
  const target = path.resolve(projectDirectory, reference.path);
  return path.extname(target) === '.json' ? target : path.join(target, PROJECT_TSCONFIG);
}

function includesSourceRoot(config, layout) {
  return (config?.include ?? []).some((entry) =>
    layout.sourceRoots.includes(path.posix.normalize(entry).split('/')[0]),
  );
}

function isSolutionTsconfig(config) {
  return (
    Array.isArray(config?.references) &&
    config.references.length > 0 &&
    config.compilerOptions === undefined &&
    config.include === undefined &&
    (config.files ?? []).length === 0
  );
}

function projectBaseTsconfig(projectDirectory, layout) {
  const project = readJsonc(path.join(projectDirectory, PROJECT_TSCONFIG));
  const projectBase = `./${PROJECT_TSCONFIG}`;
  if (!isSolutionTsconfig(project)) {
    return projectBase;
  }
  const sourceConfig = project.references
    .map((reference) => referencedConfigFile(projectDirectory, reference))
    .find((file) => existsSync(file) && includesSourceRoot(readJsonc(file), layout));
  return sourceConfig === undefined
    ? projectBase
    : `./${path.relative(projectDirectory, sourceConfig).split(path.sep).join('/')}`;
}

function projectLayeredMutationTsconfig(extended, strictMutants) {
  return {
    extends: extended,
    compilerOptions: { skipLibCheck: true, ...(strictMutants ? POLICY_COMPILER_OPTIONS : {}) },
  };
}

function projectLayeredTsconfig(extended, base, layout) {
  const layered = layoutTsconfig(base, layout);
  return {
    extends: extended,
    compilerOptions: { ...NO_EMIT_ANALYSIS_OPTIONS, ...POLICY_COMPILER_OPTIONS },
    include: layered.include,
    exclude: layered.exclude,
  };
}
