import { readPythonDependencies } from './python-dependencies.mjs';
import { LOGGER_LIBRARIES, STDLIB_LOGGER } from './logger-libraries.mjs';
import { VALIDATION_LIBRARIES } from './validation-libraries.mjs';

const DEFAULT_VALIDATION = VALIDATION_LIBRARIES[0];

function idsPresent(table, names) {
  return table
    .filter(({ packages }) => packages.some((name) => names.includes(name)))
    .map(({ id }) => id);
}

function groupOf(names) {
  return {
    validation: idsPresent(VALIDATION_LIBRARIES, names),
    logger: idsPresent(LOGGER_LIBRARIES, names),
  };
}

function ordered(production, development, kind) {
  return [...new Set([...production[kind], ...development[kind]])];
}

export function detectPythonLibraries(projectRoot) {
  const { runtime, development } = readPythonDependencies(projectRoot);
  const production = groupOf(runtime);
  const dev = groupOf(development);
  return {
    validation: ordered(production, dev, 'validation'),
    logger: ordered(production, dev, 'logger'),
  };
}

export function validationBehavior(libraries) {
  const detected = (libraries?.validation ?? [])
    .map((id) => VALIDATION_LIBRARIES.find((library) => library.id === id))
    .filter((library) => library !== undefined);
  const accepted = detected.length === 0 ? [DEFAULT_VALIDATION] : detected;
  return {
    primary: accepted[0],
    accepted,
    importRoots: accepted.flatMap(({ importRoots }) => importRoots),
    names: accepted.map(({ id }) => id),
    libraryOf: (module) =>
      accepted.find(({ importRoots }) => importRoots.includes(module.split('.')[0])),
  };
}

export function loggerBehavior(libraries) {
  const [id] = libraries?.logger ?? [];
  return LOGGER_LIBRARIES.find((library) => library.id === id) ?? STDLIB_LOGGER;
}
