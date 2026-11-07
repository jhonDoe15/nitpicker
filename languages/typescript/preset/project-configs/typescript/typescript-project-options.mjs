import { existsSync } from 'node:fs';
import path from 'node:path';
import { isPlainObject, picked } from '../../../../../shared/config.mjs';
import { isRealPathInside } from '../../../../../shared/conventions/read-inside.mjs';
import {
  missingProjectConfig,
  precedenceLayers,
} from '../../../../../shared/conventions/tool-precedence.mjs';
import {
  PROJECT_TSCONFIG,
  isSolutionTsconfig,
  readJsonc,
  referencedTsconfigs,
  tsconfigProblems,
  parsedTsconfig,
  tsconfigChain,
  typescriptVersion,
} from '../../modules/tsconfig-files.mjs';

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

export function strictCompilerOptions(javascript) {
  return { ...POLICY_COMPILER_OPTIONS, ...(javascript ? {} : TYPESCRIPT_ONLY_OPTIONS) };
}

function projectConfigName(directory, layout) {
  if (existsSync(path.join(directory, PROJECT_TSCONFIG))) {
    return PROJECT_TSCONFIG;
  }
  return layout.javascript && existsSync(path.join(directory, PROJECT_JSCONFIG))
    ? PROJECT_JSCONFIG
    : undefined;
}

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

export function extendedProjectTsconfig(projectDirectory, layout) {
  const name = projectConfigName(projectDirectory, layout);
  return name === undefined ? undefined : projectBaseTsconfig(projectDirectory, layout, name);
}

export function projectStrictValues(options, javascript) {
  const strict = strictCompilerOptions(javascript);
  const family = STRICT_FAMILY.filter((key) => options[key] === undefined);
  const values = {
    ...(typeof options.strict === 'boolean'
      ? Object.fromEntries(family.map((key) => [key, options.strict]))
      : {}),
    ...picked(options, Object.keys(strict)),
  };
  const dependents = NEEDS_STRICT_NULL_CHECKS.filter(
    (key) => key in strict && options[key] === undefined,
  );
  return values.strictNullChecks === false
    ? { ...values, ...Object.fromEntries(dependents.map((key) => [key, false])) }
    : values;
}

function lookedFor(layout) {
  return layout.javascript ? `${PROJECT_TSCONFIG} or ${PROJECT_JSCONFIG}` : PROJECT_TSCONFIG;
}

function readProjectTsconfig(projectRoot, layout) {
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

export function readTypescriptProjectConfig(projectRoot, layout) {
  const tsconfig = readProjectTsconfig(projectRoot, layout);
  if (tsconfig === undefined) {
    throw new Error(missingProjectConfig(TYPESCRIPT_TOOL, `a ${lookedFor(layout)}`));
  }
  return { compilerOptions: projectStrictValues(tsconfig.options, layout.javascript) };
}

export function relaxedStrictOptions(projectRoot, layout) {
  const tsconfig = readProjectTsconfig(projectRoot, layout);
  if (tsconfig === undefined) {
    return { relaxed: [] };
  }
  const strict = strictCompilerOptions(layout.javascript);
  return {
    file: tsconfig.name,
    relaxed: Object.keys(strict)
      .filter((key) => tsconfig.options[key] !== undefined && tsconfig.options[key] !== strict[key])
      .map((key) => `${key}: ${String(tsconfig.options[key])}`),
  };
}

export function projectTsconfigFiles(projectRoot, layout) {
  const selected = extendedProjectTsconfig(projectRoot, layout);
  if (selected === undefined) {
    return [];
  }
  const root = `./${projectConfigName(projectRoot, layout)}`;
  return [
    ...new Set([selected, root].flatMap((config) => tsconfigChain(projectRoot, config.slice(2)))),
  ];
}

export function appliedTypescriptOptions(projectRoot, layout) {
  const { compilerOptions } = readTypescriptProjectConfig(projectRoot, layout);
  return {
    config: { ...strictCompilerOptions(layout.javascript), ...compilerOptions },
    file: extendedProjectTsconfig(projectRoot, layout).slice(2),
    files: projectTsconfigFiles(projectRoot, layout),
  };
}

export function projectStrictOverrides(settings, keys) {
  const layers = precedenceLayers(settings?.precedence);
  if (!layers.usesProject || layers.nitpickerFirst) {
    return {};
  }
  if (settings.projectConfigError !== undefined) {
    throw new Error(settings.projectConfigError);
  }
  const options = settings.projectConfig?.compilerOptions;
  if (!isPlainObject(options)) {
    throw new Error('The head policy is missing the project tsconfig compiler options');
  }
  return picked(options, keys);
}
