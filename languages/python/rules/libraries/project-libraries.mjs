import { readPythonDependencies } from '../../libraries/python-dependencies.mjs';
import {
  DEFAULT_LOGGER,
  DEFAULT_VALIDATOR,
  LOGGERS,
  VALIDATORS,
  validatorNamed,
} from './library-tables.mjs';

export const DEFAULT_LIBRARIES = Object.freeze({
  logging: DEFAULT_LOGGER,
  validator: DEFAULT_VALIDATOR,
  validators: Object.freeze([DEFAULT_VALIDATOR]),
});

function foundIn(table, names) {
  return table
    .filter(({ packages }) => packages.some((name) => names.includes(name)))
    .map(({ name }) => name);
}

function declared(table, { runtime, development }) {
  return [...new Set([...foundIn(table, runtime), ...foundIn(table, development)])];
}

export function dependencyNames(projectRoot) {
  const { runtime, development } = readPythonDependencies(projectRoot);
  return new Set([...runtime, ...development]);
}

export function detectLibraries(projectRoot) {
  const dependencies = readPythonDependencies(projectRoot);
  const [logging = DEFAULT_LOGGER] = declared(LOGGERS, dependencies);
  const found = declared(VALIDATORS, dependencies);
  const validators = found.length === 0 ? [...DEFAULT_LIBRARIES.validators] : found;
  return { logging, validator: validators[0], validators };
}

export function validatorsOf(libraries) {
  if (libraries?.validators !== undefined) {
    return libraries.validators;
  }
  return libraries?.validator === undefined ? DEFAULT_LIBRARIES.validators : [libraries.validator];
}

export function boundaryRoots(libraries) {
  return validatorsOf(libraries).flatMap((name) => validatorNamed(name).importRoots);
}
