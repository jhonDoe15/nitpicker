import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JAVASCRIPT_COMPILER_OPTIONS } from '../../javascript/preset/javascript-preset.mts';
import { parsedTsconfig, projectLibs, projectRootFiles } from './modules/tsconfig-files.mts';
import {
  POLICY_COMPILER_OPTIONS,
  extendedProjectTsconfig,
  projectStrictOverrides,
  solutionCompilerOptions,
  solutionRootDir,
  strictCompilerOptions,
} from './project-configs/typescript/typescript-project-options.mts';
import {
  jsonTransform,
  layoutJscpdConfig,
  layoutKnipConfig,
  layoutStrykerTsconfig,
  layoutTsconfig,
} from './project-configs/typescript/layout-rewrites.mts';
import { readHeadPolicy } from './head-policy.mts';
import { policyTestRunner } from './test-runner/policy-runner.mts';
import { withRunnerTypes } from './test-runner/vocabulary/runner-types.mts';
import { libsWithTestDom, withTestDom } from './test-environment/dom-code/test-dom-tsconfig.mts';
import { filesOutsideRootDir } from './project-configs/typescript/solution-resolution.mts';
import { coveringAncestorTsconfig } from './project-configs/typescript/ancestor-tsconfig.mts';
import { selectedProjectTsconfig } from './modules/selected-project-tsconfig.mts';
import { fieldsOf, parseJson } from '../../../shared/values/readers.mts';
import { withoutMutantStrictness } from './typed/mutant-strictness.mts';
import {
  jscpdConfigOf,
  knipConfigOf,
  tsconfigOf,
} from './typed/tool-config/tool-config-guards.mts';
import type {
  ConfigRewrite,
  MutationTsconfigInput,
  Tsconfig,
  ToolLayout,
  TransformOptions,
} from './typed/tool-config/tool-config-types.mts';

const QUALITY_TSCONFIG = 'tsconfig.quality.json';

const STRYKER_TSCONFIG = 'tsconfig.stryker.json';

const REWRITES = new Map<string, ConfigRewrite>([
  [QUALITY_TSCONFIG, (base, layout) => layoutTsconfig(tsconfigOf(base), layout)],
  [STRYKER_TSCONFIG, (base, layout) => layoutStrykerTsconfig(tsconfigOf(base), layout)],
  ['knip.json', (base, layout) => layoutKnipConfig(knipConfigOf(base), layout)],
  ['jscpd.json', (base, layout) => layoutJscpdConfig(jscpdConfigOf(base), layout)],
]);

const TSCONFIG_POLICY_FILES = new Set([QUALITY_TSCONFIG, STRYKER_TSCONFIG]);

export function layoutTransformFor(
  policyFileName: string,
  layout: ToolLayout,
  { strictMutants = true, projectRootFiles: withRootFiles = false }: TransformOptions = {},
): ((text: string, targetPath: string) => string) | undefined {
  const name = policyFileName.split('/').at(-1) ?? policyFileName;
  const rewrite = REWRITES.get(name);
  const layoutTransform = rewrite === undefined ? undefined : jsonTransform(rewrite, layout);
  if (!TSCONFIG_POLICY_FILES.has(name)) {
    return layoutTransform;
  }
  const relaxesMutants = name === STRYKER_TSCONFIG && !strictMutants;
  return (text, targetPath) => {
    const projectDirectory = path.dirname(targetPath);
    const { typescriptProject } = layout;
    if (typescriptProject !== undefined) {
      return selectedProjectTsconfig(projectDirectory, {
        typescriptProject,
        exclude: layout.exclude,
      });
    }
    const extended = extendedProjectTsconfig(projectDirectory, layout);
    if (extended !== undefined) {
      const layered =
        name === STRYKER_TSCONFIG
          ? projectLayeredMutationTsconfig(extended, { strictMutants, layout, projectDirectory })
          : projectLayeredTsconfig(extended, tsconfigOf(parseJson(text)), {
              layout,
              projectDirectory,
              withRootFiles,
            });
      return `${JSON.stringify(layered, null, 2)}\n`;
    }
    const ancestor =
      name === QUALITY_TSCONFIG ? coveringAncestorTsconfig(projectDirectory) : undefined;
    if (ancestor !== undefined) {
      const layered = projectLayeredTsconfig(ancestor.extended, tsconfigOf(parseJson(text)), {
        layout,
        projectDirectory,
        withRootFiles: false,
      });
      const unset = {
        ...layered,
        compilerOptions: { ...fieldsOf(layered['compilerOptions']), ...ANCESTOR_UNSET },
      };
      return `${JSON.stringify(ancestor.hasFiles ? { files: [], ...unset } : unset, null, 2)}\n`;
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

function strictOverrides(
  layout: ToolLayout,
  keys: readonly string[] = Object.keys(strictCompilerOptions(layout)),
): Record<string, unknown> {
  return projectStrictOverrides(layout.typescriptSettings, keys);
}

function withProjectStrictness(text: string, layout: ToolLayout): string {
  const overrides = strictOverrides(layout);
  if (Object.keys(overrides).length === 0) {
    return text;
  }
  const config = fieldsOf(parseJson(text));
  const compilerOptions = { ...fieldsOf(config['compilerOptions']), ...overrides };
  return `${JSON.stringify({ ...config, compilerOptions }, null, 2)}\n`;
}

const JAVASCRIPT_PROJECT_OPTIONS = { ...JAVASCRIPT_COMPILER_OPTIONS, maxNodeModuleJsDepth: 0 };

function javascriptProjectOptions(
  layout: ToolLayout,
  projectDirectory: string,
  extended: string,
): Record<string, unknown> {
  if (!layout.javascript) {
    return {};
  }
  const { jsx, ...options } = JAVASCRIPT_PROJECT_OPTIONS;
  return parsedTsconfig(path.join(projectDirectory, extended)).options.jsx === undefined
    ? { ...options, jsx }
    : options;
}

const ANCESTOR_UNSET = { composite: false, rootDir: null, declarationDir: null };

const ANALYSIS_OPTIONS = {
  allowJs: true,
  isolatedDeclarations: false,
  noCheck: false,
  noEmit: true,
  skipLibCheck: true,
};

function projectLayeredMutationTsconfig(
  extended: string,
  { strictMutants, layout, projectDirectory }: MutationTsconfigInput,
): Record<string, unknown> {
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

function shippedQualityTsconfig(): Tsconfig {
  return tsconfigOf(
    parseJson(readFileSync(new URL('defaults/tsconfig.quality.json', import.meta.url), 'utf8')),
  );
}

export function filesLeftOutsideRootDir(
  projectDirectory: string,
  layout: ToolLayout,
  base: Tsconfig = shippedQualityTsconfig(),
): string[] {
  return filesOutsideRootDir(
    projectDirectory,
    layoutTsconfig(base, layout),
    solutionRootDir(projectDirectory, layout),
  );
}

function projectLayeredTsconfig(
  extended: string,
  base: Tsconfig,
  {
    layout,
    projectDirectory,
    withRootFiles,
  }: { layout: ToolLayout; projectDirectory: string; withRootFiles: boolean },
): Record<string, unknown> {
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
      ...strictCompilerOptions(layout),
      ...strictOverrides(layout),
      ...javascriptOptions,
      ...(lib === undefined ? {} : { lib }),
    },
    ...(rootFiles.length === 0 ? {} : { files: rootFiles }),
    include: layered.include,
    exclude: [...layered.exclude, ...filesLeftOutsideRootDir(projectDirectory, layout, base)],
  };
}
