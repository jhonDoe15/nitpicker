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
import { projectLibs } from './modules/tsconfig-files.mjs';
import {
  POLICY_COMPILER_OPTIONS,
  TYPESCRIPT_ONLY_OPTIONS,
  extendedProjectTsconfig,
  projectStrictOverrides,
  strictCompilerOptions,
} from './project-configs/typescript-project-options.mjs';
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
    const extended = extendedProjectTsconfig(projectDirectory, layout);
    if (extended !== undefined) {
      const layered =
        name === STRYKER_TSCONFIG
          ? projectLayeredMutationTsconfig(extended, { strictMutants, layout })
          : projectLayeredTsconfig(extended, JSON.parse(text), { layout, projectDirectory });
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const rewritten = withProjectStrictness(
      withEndToEndDom(layoutTransform?.(text) ?? text, name, { projectDirectory, layout }),
      layout,
    );
    return relaxesMutants ? withoutMutantStrictness(rewritten) : rewritten;
  };
}

const DOM_LIB = 'dom';
function libsWithEndToEndDom(libs, projectDirectory, layout) {
  const hasEndToEnd =
    layout.testRoots.includes(END_TO_END_ROOT) &&
    existsSync(path.join(projectDirectory, END_TO_END_ROOT));
  const lacksDom = libs?.every((lib) => lib.toLowerCase() !== DOM_LIB) ?? false;
  return hasEndToEnd && lacksDom ? [...libs, DOM_LIB] : undefined;
}

function withEndToEndDom(text, name, { projectDirectory, layout }) {
  if (name !== 'tsconfig.quality.json') {
    return text;
  }
  const config = JSON.parse(text);
  const lib = libsWithEndToEndDom(config.compilerOptions?.lib, projectDirectory, layout);
  if (lib === undefined) {
    return text;
  }
  return `${JSON.stringify({ ...config, compilerOptions: { ...config.compilerOptions, lib } }, null, 2)}\n`;
}

function strictOverrides(layout, keys = Object.keys(strictCompilerOptions(layout.javascript))) {
  return projectStrictOverrides(layout.typescriptSettings, keys);
}

function withProjectStrictness(text, layout) {
  const overrides = strictOverrides(layout);
  if (Object.keys(overrides).length === 0) {
    return text;
  }
  const config = JSON.parse(text);
  const compilerOptions = { ...config.compilerOptions, ...overrides };
  return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
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

const MUTANT_STRICTNESS_OPTIONS = new Set([
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
]);

const ANALYSIS_OPTIONS = { allowJs: true, noEmit: true, skipLibCheck: true };

function projectLayeredMutationTsconfig(extended, { strictMutants, layout }) {
  return {
    extends: extended,
    compilerOptions: {
      skipLibCheck: true,
      ...(strictMutants ? POLICY_COMPILER_OPTIONS : {}),
      ...strictOverrides(layout, Object.keys(POLICY_COMPILER_OPTIONS)),
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
      ...ANALYSIS_OPTIONS,
      ...strictCompilerOptions(layout.javascript),
      ...strictOverrides(layout),
      ...javascriptOptions,
      ...(lib === undefined ? {} : { lib }),
    },
    include: layered.include,
    exclude: layered.exclude,
  };
}
