import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JAVASCRIPT_COMPILER_OPTIONS } from '../../javascript/preset/javascript-preset.mjs';
import { parsedTsconfig, projectLibs, projectRootFiles } from './modules/tsconfig-files.mjs';
import {
  POLICY_COMPILER_OPTIONS,
  extendedProjectTsconfig,
  projectStrictOverrides,
  solutionCompilerOptions,
  solutionRootDir,
  strictCompilerOptions,
} from './project-configs/typescript/typescript-project-options.mjs';
import {
  jsonTransform,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutStrykerTsconfig,
  layoutTsconfig,
} from './project-configs/typescript/layout-rewrites.mjs';
import { readHeadPolicy } from './head-policy.mjs';
import { policyTestRunner } from './test-runner/policy-runner.mjs';
import { withRunnerTypes } from './test-runner/vocabulary/runner-types.mjs';
import { libsWithTestDom, withTestDom } from './test-environment/dom-code/test-dom-tsconfig.mjs';
import { filesOutsideRootDir } from './project-configs/typescript/solution-resolution.mjs';
import { selectedProjectTsconfig } from './modules/selected-project-tsconfig.mjs';

const QUALITY_TSCONFIG = 'tsconfig.quality.json';

const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

const REWRITES = new Map([
  [QUALITY_TSCONFIG, layoutTsconfig],
  [STRYKER_TSCONFIG, layoutStrykerTsconfig],
  ['knip.json', layoutKnipConfig],
  ['jscpd.json', layoutJscpdConfig],
]);

const TSCONFIG_POLICY_FILES = new Set([QUALITY_TSCONFIG, STRYKER_TSCONFIG]);

export function layoutTransformFor(
  policyFileName,
  layout,
  { strictMutants = true, projectRootFiles: withRootFiles = false } = {},
) {
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
          ? projectLayeredMutationTsconfig(extended, { strictMutants, layout, projectDirectory })
          : projectLayeredTsconfig(extended, JSON.parse(text), {
              layout,
              projectDirectory,
              withRootFiles,
            });
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const rewritten = withProjectStrictness(
      withTestDom(layoutTransform?.(text) ?? text, name, { projectDirectory, layout }),
      layout,
    );
    const runner = policyTestRunner(readHeadPolicy(), projectDirectory);
    const typed = withRunnerTypes(rewritten, { runner, projectDirectory });
    return relaxesMutants ? withoutMutantStrictness(typed) : typed;
  };
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

const JAVASCRIPT_PROJECT_OPTIONS = { ...JAVASCRIPT_COMPILER_OPTIONS, maxNodeModuleJsDepth: 0 };

function javascriptProjectOptions(layout, projectDirectory, extended) {
  if (!layout.javascript) {
    return {};
  }
  const { jsx, ...options } = JAVASCRIPT_PROJECT_OPTIONS;
  return parsedTsconfig(path.join(projectDirectory, extended)).options.jsx === undefined
    ? { ...options, jsx }
    : options;
}
const MUTANT_STRICTNESS_OPTIONS = new Set([
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedIndexedAccess',
]);

const ANALYSIS_OPTIONS = {
  allowJs: true,
  isolatedDeclarations: false,
  noCheck: false,
  noEmit: true,
  skipLibCheck: true,
};

function projectLayeredMutationTsconfig(extended, { strictMutants, layout, projectDirectory }) {
  return {
    extends: extended,
    compilerOptions: {
      ...solutionCompilerOptions(projectDirectory, layout),
      isolatedDeclarations: false,
      noCheck: false,
      skipLibCheck: true,
      ...(strictMutants ? POLICY_COMPILER_OPTIONS : {}),
      ...strictOverrides(layout, Object.keys(POLICY_COMPILER_OPTIONS)),
      ...javascriptProjectOptions(layout, projectDirectory, extended),
    },
  };
}

function shippedQualityTsconfig() {
  return JSON.parse(
    readFileSync(new URL('defaults/tsconfig.quality.json', import.meta.url), 'utf8'),
  );
}

export function filesLeftOutsideRootDir(projectDirectory, layout, base = shippedQualityTsconfig()) {
  return filesOutsideRootDir(
    projectDirectory,
    layoutTsconfig(base, layout),
    solutionRootDir(projectDirectory, layout),
  );
}

function projectLayeredTsconfig(extended, base, { layout, projectDirectory, withRootFiles }) {
  const javascriptOptions = javascriptProjectOptions(layout, projectDirectory, extended);
  const layered = layoutTsconfig(base, layout);
  const rootFiles = withRootFiles ? projectRootFiles(projectDirectory, extended) : [];
  const lib = libsWithTestDom(projectLibs(projectDirectory, extended), QUALITY_TSCONFIG, {
    projectDirectory,
    layout,
  });
  return {
    extends: extended,
    compilerOptions: {
      ...solutionCompilerOptions(projectDirectory, layout),
      ...ANALYSIS_OPTIONS,
      ...strictCompilerOptions(layout.javascript),
      ...strictOverrides(layout),
      ...javascriptOptions,
      ...(lib === undefined ? {} : { lib }),
    },
    ...(rootFiles.length === 0 ? {} : { files: rootFiles }),
    include: layered.include,
    exclude: [...layered.exclude, ...filesLeftOutsideRootDir(projectDirectory, layout, base)],
  };
}
