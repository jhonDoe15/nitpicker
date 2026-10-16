import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMAT,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';
import { END_TO_END_ROOT, testRoots } from './layout.mjs';
import {
  PROJECT_TSCONFIG,
  isSolutionTsconfig,
  readJsonc,
  referencedConfigFile,
} from './modules/tsconfig-files.mjs';

const DEFAULT_SOURCE_ROOT = 'src';
const DEFAULT_TEST_ROOTS = new Set(testRoots);
const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

function executedRoots(layout) {
  return layout.executedTestRoots ?? layout.testRoots;
}

function expandLayoutRoots(entries, layout, testRootsOf = (value) => value.testRoots) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (first === DEFAULT_SOURCE_ROOT) {
      return layout.sourceRoots.map((root) => `${root}${suffix}`);
    }
    if (DEFAULT_TEST_ROOTS.has(first)) {
      return testRootsOf(layout).map((root) => `${root}${suffix}`);
    }
    return [entry];
  });
  return [...new Set(expanded)];
}

export function isCustomLayout(layout) {
  return (
    JSON.stringify([layout.sourceRoots, layout.testRoots, executedRoots(layout)]) !==
      JSON.stringify([
        [DEFAULT_SOURCE_ROOT],
        [...DEFAULT_TEST_ROOTS],
        [...DEFAULT_TEST_ROOTS].filter((root) => root !== END_TO_END_ROOT),
      ]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0
  );
}

function tsconfigRewrite(javascriptOptions, testRootsOf) {
  return function rewriteTsconfig(base, layout) {
    return {
      ...base,
      ...(layout.javascript
        ? { compilerOptions: { ...base.compilerOptions, ...javascriptOptions } }
        : {}),
      include: expandLayoutRoots(base.include, layout, testRootsOf),
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

export const layoutTsconfig = tsconfigRewrite(
  {
    ...JAVASCRIPT_COMPILER_OPTIONS,
    ...JAVASCRIPT_RELAXED_OPTIONS,
    noEmit: true,
  },
  (layout) => layout.testRoots,
);

export const layoutStrykerTsconfig = tsconfigRewrite(JAVASCRIPT_COMPILER_OPTIONS, executedRoots);

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
          : projectLayeredTsconfig(extended, JSON.parse(text), { layout, projectDirectory });
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const rewritten = withEndToEndDom(layoutTransform?.(text) ?? text, name, {
      projectDirectory,
      layout,
    });
    return relaxesMutants ? withoutMutantStrictness(rewritten) : rewritten;
  };
}

const DOM_LIB = 'dom';
const LIB_FILE = /^lib\.(.+)\.d\.ts$/u;

function projectLibs(projectDirectory, configName) {
  const typescript = createRequire(import.meta.url)('typescript');
  const { options } = typescript.parseJsonConfigFileContent(
    readJsonc(path.join(projectDirectory, configName)),
    typescript.sys,
    projectDirectory,
  );
  return options.lib?.map((lib) => path.basename(lib).replace(LIB_FILE, '$1'));
}

function libsWithEndToEndDom(libs, projectDirectory, layout) {
  const hasEndToEnd =
    layout.testRoots.includes(END_TO_END_ROOT) &&
    existsSync(path.join(projectDirectory, END_TO_END_ROOT));
  const lacksDom = libs?.every((lib) => lib.toLowerCase() !== DOM_LIB) ?? false;
  return hasEndToEnd && lacksDom ? [...libs, DOM_LIB] : undefined;
}

function withEndToEndDom(text, name, { projectDirectory, layout }) {
  const config = JSON.parse(text);
  const lib = libsWithEndToEndDom(config.compilerOptions.lib, projectDirectory, layout);
  if (name !== 'tsconfig.quality.json' || lib === undefined) {
    return text;
  }
  return `${JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, lib } }, null, 2)}\n`;
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

const NO_EMIT_ANALYSIS_OPTIONS = { noEmit: true, skipLibCheck: true };

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

function projectLayeredTsconfig(extended, base, { layout, projectDirectory }) {
  const javascriptOptions = layout.javascript ? JAVASCRIPT_COMPILER_OPTIONS : {};
  const layered = layoutTsconfig(base, layout);
  const lib = libsWithEndToEndDom(
    projectLibs(projectDirectory, extended),
    projectDirectory,
    layout,
  );
  return {
    extends: extended,
    compilerOptions: {
      ...NO_EMIT_ANALYSIS_OPTIONS,
      ...POLICY_COMPILER_OPTIONS,
      ...(layout.javascript ? {} : TYPESCRIPT_ONLY_OPTIONS),
      ...javascriptOptions,
      ...(lib === undefined ? {} : { lib }),
    },
    include: layered.include,
    exclude: layered.exclude,
  };
}
