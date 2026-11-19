import { existsSync } from 'node:fs';
import path from 'node:path';
import { fieldOf, isPlainObject, textOf } from '../../../../../shared/values/readers.mts';
import {
  isRealPathInside,
  missingProjectConfig,
  picked,
  precedenceLayers,
} from '../../project-tools/typed/shared-views.mts';
import type { ToolSettings } from '../../project-tools/typed/tool-types.mts';
import type { ProjectTsconfig, SolutionChoice, SolutionLayout } from '../project-config-types.mts';
import { solutionChoice } from './solution-resolution.mts';
import {
  PROJECT_TSCONFIG,
  tsconfigProblems,
  parsedTsconfig,
  tsconfigChain,
  typescriptVersion,
} from '../../modules/tsconfig-files.mts';

export const TYPESCRIPT_TOOL = 'typescript';

const PROJECT_JSCONFIG = 'jsconfig.json';

export const POLICY_COMPILER_OPTIONS = {
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

export const TYPESCRIPT_ONLY_OPTIONS = {
  exactOptionalPropertyTypes: true,
  noPropertyAccessFromIndexSignature: true,
  noUncheckedSideEffectImports: true,
};

const STRICT_FAMILY = [
  'noImplicitAny',
  'strictNullChecks',
  'strictFunctionTypes',
  'strictBindCallApply',
  'strictPropertyInitialization',
  'noImplicitThis',
  'useUnknownInCatchVariables',
];
const NEEDS_STRICT_NULL_CHECKS = ['strictPropertyInitialization', 'exactOptionalPropertyTypes'];

export function strictCompilerOptions(layout: {
  readonly javascript: boolean;
}): Record<string, boolean> {
  return { ...POLICY_COMPILER_OPTIONS, ...(layout.javascript ? {} : TYPESCRIPT_ONLY_OPTIONS) };
}

function projectConfigName(directory: string, layout: { javascript: boolean }): string | undefined {
  if (existsSync(path.join(directory, PROJECT_TSCONFIG))) {
    return PROJECT_TSCONFIG;
  }
  return layout.javascript && existsSync(path.join(directory, PROJECT_JSCONFIG))
    ? PROJECT_JSCONFIG
    : undefined;
}

export function extendedProjectTsconfig(
  projectDirectory: string,
  layout: SolutionLayout,
): string | undefined {
  const name = projectConfigName(projectDirectory, layout);
  if (name === undefined) {
    return undefined;
  }
  return `./${solutionChoice(projectDirectory, layout, name)?.file ?? name}`;
}

export function solutionResolution(
  projectDirectory: string,
  layout: SolutionLayout,
): (SolutionChoice & { from: string }) | undefined {
  const name = projectConfigName(projectDirectory, layout);
  if (name === undefined) {
    return undefined;
  }
  const chosen = solutionChoice(projectDirectory, layout, name);
  return chosen === undefined ? undefined : { from: name, ...chosen };
}

export function solutionRootDir(
  projectDirectory: string,
  layout: SolutionLayout,
): string | undefined {
  return solutionResolution(projectDirectory, layout)?.keptRootDir;
}

export function solutionCompilerOptions(
  projectDirectory: string,
  layout: SolutionLayout,
): Readonly<Record<string, unknown>> {
  return solutionResolution(projectDirectory, layout)?.compilerOptions ?? {};
}

export function projectStrictValues(
  options: Readonly<Record<string, unknown>>,
  javascript: boolean,
): Record<string, unknown> {
  const strict = strictCompilerOptions({ javascript });
  const family = STRICT_FAMILY.filter((key) => options[key] === undefined);
  const values = {
    ...(typeof fieldOf(options, 'strict') === 'boolean'
      ? Object.fromEntries(family.map((key) => [key, fieldOf(options, 'strict')]))
      : {}),
    ...picked(options, Object.keys(strict)),
  };
  const dependents = NEEDS_STRICT_NULL_CHECKS.filter(
    (key) => key in strict && options[key] === undefined,
  );
  return fieldOf(values, 'strictNullChecks') === false
    ? { ...values, ...Object.fromEntries(dependents.map((key) => [key, false])) }
    : values;
}

function lookedFor(layout: { javascript: boolean }): string {
  return layout.javascript ? `${PROJECT_TSCONFIG} or ${PROJECT_JSCONFIG}` : PROJECT_TSCONFIG;
}

function readProjectTsconfig(
  projectRoot: string,
  layout: SolutionLayout,
): ProjectTsconfig | undefined {
  const extended = extendedProjectTsconfig(projectRoot, layout);
  if (extended === undefined) {
    return undefined;
  }
  const name = extended.slice(2);
  const file = path.join(projectRoot, extended);
  if (!isRealPathInside(projectRoot, file)) {
    throw new Error(`${name} must stay inside the project`);
  }
  const problems = tsconfigProblems(file);
  if (problems.length > 0) {
    throw new Error(
      `${name} cannot be read by TypeScript ${typescriptVersion()}: ${problems.join('; ')}`,
    );
  }
  return { name, options: parsedTsconfig(file).options };
}

export function readTypescriptProjectConfig(
  projectRoot: string,
  layout: SolutionLayout,
): { compilerOptions: Record<string, unknown> } {
  const tsconfig = readProjectTsconfig(projectRoot, layout);
  if (tsconfig === undefined) {
    throw new Error(missingProjectConfig(TYPESCRIPT_TOOL, `a ${lookedFor(layout)}`));
  }
  return { compilerOptions: projectStrictValues(tsconfig.options, layout.javascript) };
}

export function relaxedStrictOptions(
  projectRoot: string,
  layout: SolutionLayout,
): { file?: string; relaxed: string[] } {
  const tsconfig = readProjectTsconfig(projectRoot, layout);
  if (tsconfig === undefined) {
    return { relaxed: [] };
  }
  const strict = strictCompilerOptions(layout);
  return {
    file: tsconfig.name,
    relaxed: Object.keys(strict)
      .filter((key) => tsconfig.options[key] !== undefined && tsconfig.options[key] !== strict[key])
      .map((key) => `${key}: ${String(tsconfig.options[key])}`),
  };
}

export function projectTsconfigFiles(projectRoot: string, layout: SolutionLayout): string[] {
  const selected = extendedProjectTsconfig(projectRoot, layout);
  if (selected === undefined) {
    return [];
  }
  const root = `./${String(projectConfigName(projectRoot, layout))}`;
  const merged = (solutionResolution(projectRoot, layout)?.typesFrom ?? []).map(
    (file) => `./${file}`,
  );
  return [
    ...new Set(
      [selected, root, ...merged].flatMap((config) => tsconfigChain(projectRoot, config.slice(2))),
    ),
  ];
}

export function appliedTypescriptOptions(
  projectRoot: string,
  layout: SolutionLayout,
): { config: Record<string, unknown>; file: string; files: string[] } {
  const { compilerOptions } = readTypescriptProjectConfig(projectRoot, layout);
  return {
    config: { ...strictCompilerOptions(layout), ...compilerOptions },
    file: (extendedProjectTsconfig(projectRoot, layout) ?? '').slice(2),
    files: projectTsconfigFiles(projectRoot, layout),
  };
}

export function projectStrictOverrides(
  settings: ToolSettings | undefined,
  keys: readonly string[],
): Record<string, unknown> {
  const layers = precedenceLayers(settings?.precedence);
  if (settings === undefined || !layers.usesProject || layers.nitpickerFirst) {
    return {};
  }
  const failure = fieldOf(settings, 'projectConfigError');
  if (failure !== undefined) {
    throw new Error(textOf(failure));
  }
  const options = fieldOf(fieldOf(settings, 'projectConfig'), 'compilerOptions');
  if (!isPlainObject(options)) {
    throw new Error('The head policy is missing the project tsconfig compiler options');
  }
  return picked(options, keys);
}
