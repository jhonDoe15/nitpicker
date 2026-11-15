import { readPythonDependencies } from '../../libraries/typed/dependency-views.mts';
import type { DetectedLibraries, Libraries, PackageTable } from './typed/library-types.mts';
import {
  DATABASES,
  DEFAULT_DATABASE,
  DEFAULT_LOGGER,
  DEFAULT_VALIDATOR,
  LOGGERS,
  VALIDATORS,
  validatorNamed,
} from './library-tables.mts';

export const DEFAULT_LIBRARIES: DetectedLibraries = Object.freeze({
  database: DEFAULT_DATABASE,
  logging: DEFAULT_LOGGER,
  validator: DEFAULT_VALIDATOR,
  validators: Object.freeze([DEFAULT_VALIDATOR]),
});

function foundIn(table: readonly PackageTable[], names: readonly string[]): string[] {
  return table
    .filter(({ packages }) => packages.some((name) => names.includes(name)))
    .map(({ name }) => name);
}

function declared(
  table: readonly PackageTable[],
  { runtime, development }: { runtime: readonly string[]; development: readonly string[] },
): string[] {
  return [...new Set([...foundIn(table, runtime), ...foundIn(table, development)])];
}

export function dependencyNames(projectRoot: string): Set<string> {
  const { runtime, development } = readPythonDependencies(projectRoot);
  return new Set([...runtime, ...development]);
}

export function detectLibraries(projectRoot: string): DetectedLibraries {
  const dependencies = readPythonDependencies(projectRoot);
  const [logging = DEFAULT_LOGGER] = declared(LOGGERS, dependencies);
  const [database = DEFAULT_DATABASE] = declared(DATABASES, dependencies);
  const found = declared(VALIDATORS, dependencies);
  const validators = found.length === 0 ? [...DEFAULT_LIBRARIES.validators] : found;
  const [validator = DEFAULT_VALIDATOR] = validators;
  return { database, logging, validator, validators };
}

export function validatorsOf(libraries?: Libraries): readonly string[] {
  if (libraries?.validators !== undefined) {
    return libraries.validators;
  }
  return libraries?.validator === undefined ? DEFAULT_LIBRARIES.validators : [libraries.validator];
}

export function boundaryRoots(libraries?: Libraries): readonly string[] {
  return validatorsOf(libraries).flatMap((name) => validatorNamed(name).importRoots);
}
