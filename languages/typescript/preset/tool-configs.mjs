import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMAT,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';
import {
  PROJECT_TSCONFIG,
  isSolutionTsconfig,
  readJsonc,
  referencedConfigFile,
} from './modules/tsconfig-files.mjs';
import { sourceRoots, testRoots } from './layout.mjs';

const DEFAULT_SOURCE_ROOTS = new Set(sourceRoots);
const DEFAULT_TEST_ROOTS = new Set(testRoots);
const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

function expandLayoutRoots(entries, layout) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (DEFAULT_SOURCE_ROOTS.has(first)) {
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
      JSON.stringify([sourceRoots, testRoots]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0
  );
}

function tsconfigRewrite(javascriptOptions) {
  return function rewriteTsconfig(base, layout) {
    return {
      ...base,
      ...(layout.javascript
        ? { compilerOptions: { ...base.compilerOptions, ...javascriptOptions } }
        : {}),
      include: expandLayoutRoots(base.include, layout),
      exclude: [...base.exclude, ...layout.exclude],
    };
  };
}

const TYPESCRIPT_ONLY_OPTIONS = {
  exactOptionalPropertyTypes: true,
  noPropertyAccessFromIndexSignature: true,
  noUncheckedSideEffectImports: true,
};

const JAVASCRIPT_RELAXED_OPTIONS = Object.fromEntries(
  Object.keys(TYPESCRIPT_ONLY_OPTIONS).map((option) => [option, false]),
);

export const layoutTsconfig = tsconfigRewrite({
  ...JAVASCRIPT_COMPILER_OPTIONS,
  ...JAVASCRIPT_RELAXED_OPTIONS,
  noEmit: true,
});

const layoutStrykerTsconfig = tsconfigRewrite(JAVASCRIPT_COMPILER_OPTIONS);

export function layoutKnipConfig(base, layout) {
  const javascript = layout.javascript === true;
  return {
    ...base,
    entry: [
      ...expandLayoutRoots(
        javascript ? [...base.entry, ...JAVASCRIPT_KNIP_ENTRIES] : base.entry,
        layout,
      ),
      ...(layout.entryPoints ?? []),
    ],
    project: expandLayoutRoots(
      javascript ? [...base.project, ...JAVASCRIPT_KNIP_PROJECT] : base.project,
      layout,
    ),
    ignore: [...expandLayoutRoots(base.ignore, layout), ...layout.exclude],
  };
}

export function layoutJscpdConfig(base, layout) {
  return {
    ...base,
    ...(layout.javascript ? { format: [...base.format, JAVASCRIPT_JSCPD_FORMAT] } : {}),
    path: expandLayoutRoots(base.path, layout),
    ignore: [...base.ignore, ...layout.exclude],
  };
}

export function jsonTransform(rewrite, layout) {
  if (!isCustomLayout(layout) && layout.javascript !== true) {
    return undefined;
  }
  return (text) => `${JSON.stringify(rewrite(JSON.parse(text), layout), null, 2)}\n`;
}

const REWRITES = new Map([
  ['tsconfig.quality.json', layoutTsconfig],
  [STRYKER_TSCONFIG, layoutStrykerTsconfig],
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
    const projectConfig = projectConfigName(projectDirectory, layout);
    if (projectConfig !== undefined) {
      const extended = projectBaseTsconfig(projectDirectory, layout, projectConfig);
      const layered =
        name === STRYKER_TSCONFIG
          ? projectLayeredMutationTsconfig(extended, { strictMutants, layout })
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

const PROJECT_JSCONFIG = 'jsconfig.json';
const MUTANT_STRICTNESS_OPTIONS = new Set([
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
]);

function projectConfigName(directory, layout) {
  if (existsSync(path.join(directory, PROJECT_TSCONFIG))) {
    return PROJECT_TSCONFIG;
  }
  return layout.javascript && existsSync(path.join(directory, PROJECT_JSCONFIG))
    ? PROJECT_JSCONFIG
    : undefined;
}

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

const ANALYSIS_OPTIONS = { allowJs: true, noEmit: true, skipLibCheck: true };

function includesSourceRoot(config, layout) {
  return (config?.include ?? []).some((entry) =>
    layout.sourceRoots.includes(path.posix.normalize(entry).split('/')[0]),
  );
}

function projectBaseTsconfig(projectDirectory, layout, projectConfig) {
  const project = readJsonc(path.join(projectDirectory, projectConfig));
  const projectBase = `./${projectConfig}`;
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

function projectLayeredMutationTsconfig(extended, { strictMutants, layout }) {
  return {
    extends: extended,
    compilerOptions: {
      skipLibCheck: true,
      ...(strictMutants ? POLICY_COMPILER_OPTIONS : {}),
      ...(layout.javascript ? JAVASCRIPT_COMPILER_OPTIONS : {}),
    },
  };
}

function projectLayeredTsconfig(extended, base, layout) {
  const javascriptOptions = layout.javascript ? JAVASCRIPT_COMPILER_OPTIONS : {};
  const layered = layoutTsconfig(base, layout);
  return {
    extends: extended,
    compilerOptions: {
      ...ANALYSIS_OPTIONS,
      ...POLICY_COMPILER_OPTIONS,
      ...(layout.javascript ? {} : TYPESCRIPT_ONLY_OPTIONS),
      ...javascriptOptions,
    },
    include: layered.include,
    exclude: layered.exclude,
  };
}
