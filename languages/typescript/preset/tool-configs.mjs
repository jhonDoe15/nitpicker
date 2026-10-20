import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  JAVASCRIPT_COMPILER_OPTIONS,
  JAVASCRIPT_JSCPD_FORMAT,
  JAVASCRIPT_KNIP_ENTRIES,
  JAVASCRIPT_KNIP_PROJECT,
} from '../../javascript/preset/javascript-preset.mjs';
import {
  SCRIPT_SKIPPED_FOLDERS,
  withSkippedFolders,
} from '../../../core/tooling/jscpd/skipped-folders.mjs';
import {
  PROJECT_TSCONFIG,
  isSolutionTsconfig,
  projectLibs,
  readJsonc,
  referencedTsconfigs,
} from './modules/tsconfig-files.mjs';
import { readHeadPolicy } from './head-policy.mjs';
import { policyTestRunner } from './test-runner/project-runner.mjs';
import { withRunnerTypes } from './test-runner/runner-types.mjs';
import { libsWithTestDom, withTestDom } from './test-environment/test-dom-tsconfig.mjs';
import { selectedProjectTsconfig } from './modules/selected-project-tsconfig.mjs';
import { END_TO_END_ROOT, sourceRoots, testRoots } from './layout.mjs';

const DEFAULT_SOURCE_ROOTS = new Set(sourceRoots);
const DEFAULT_TEST_ROOTS = new Set(testRoots);
const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

function executedRoots(layout) {
  return layout.executedTestRoots ?? layout.testRoots;
}

function expandLayoutRoots(entries, layout, testRootsOf = (value) => value.testRoots) {
  const expanded = entries.flatMap((entry) => {
    const [first, ...rest] = entry.split('/');
    const suffix = rest.length === 0 ? '' : `/${rest.join('/')}`;
    if (DEFAULT_SOURCE_ROOTS.has(first)) {
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
        sourceRoots,
        testRoots,
        testRoots.filter((root) => root !== END_TO_END_ROOT),
      ]) ||
    layout.exclude.length > 0 ||
    (layout.entryPoints ?? []).length > 0 ||
    layout.duplicateSkippedFolders !== undefined
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
  { ...JAVASCRIPT_COMPILER_OPTIONS, ...JAVASCRIPT_RELAXED_OPTIONS, noEmit: true },
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
    ignore: [
      ...withSkippedFolders(base.ignore, SCRIPT_SKIPPED_FOLDERS, layout.duplicateSkippedFolders),
      ...layout.exclude,
    ],
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
    if (layout.typescriptProject !== undefined) {
      return selectedProjectTsconfig(projectDirectory, layout);
    }
    const projectConfig = projectConfigName(projectDirectory, layout);
    if (projectConfig !== undefined) {
      const extended = projectBaseTsconfig(projectDirectory, layout, projectConfig);
      const layered =
        name === STRYKER_TSCONFIG
          ? projectLayeredMutationTsconfig(extended, { strictMutants, layout })
          : projectLayeredTsconfig(extended, JSON.parse(text), { layout, projectDirectory });
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const rewritten = withTestDom(layoutTransform?.(text) ?? text, name, {
      projectDirectory,
      layout,
    });
    const runner = policyTestRunner(readHeadPolicy(), projectDirectory);
    const typed = withRunnerTypes(rewritten, { runner, projectDirectory });
    return relaxesMutants ? withoutMutantStrictness(typed) : typed;
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
const JAVASCRIPT_PROJECT_OPTIONS = { ...JAVASCRIPT_COMPILER_OPTIONS, maxNodeModuleJsDepth: 0 };
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
  const sourceConfig = referencedTsconfigs(
    path.join(projectDirectory, projectConfig),
    project,
  ).find((file) => includesSourceRoot(readJsonc(file), layout));
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
      ...(layout.javascript ? JAVASCRIPT_PROJECT_OPTIONS : {}),
    },
  };
}

function projectLayeredTsconfig(extended, base, { layout, projectDirectory }) {
  const javascriptOptions = layout.javascript ? JAVASCRIPT_PROJECT_OPTIONS : {};
  const layered = layoutTsconfig(base, layout);
  const lib = libsWithTestDom(projectLibs(projectDirectory, extended), 'tsconfig.quality.json', {
    projectDirectory,
    layout,
  });
  return {
    extends: extended,
    compilerOptions: {
      ...ANALYSIS_OPTIONS,
      ...POLICY_COMPILER_OPTIONS,
      ...(layout.javascript ? {} : TYPESCRIPT_ONLY_OPTIONS),
      ...javascriptOptions,
      ...(lib === undefined ? {} : { lib }),
    },
    include: layered.include,
    exclude: layered.exclude,
  };
}
