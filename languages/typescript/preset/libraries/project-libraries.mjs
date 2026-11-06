import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import { readManifest } from '../eslint-config/scope-support.mjs';
import { LOGGER_LIBRARIES } from './logger-libraries.mjs';
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

function manifestLibraries(manifest) {
  return {
    production: groupOf([
      ...Object.keys(manifest?.dependencies ?? {}),
      ...Object.keys(manifest?.peerDependencies ?? {}),
      ...Object.keys(manifest?.optionalDependencies ?? {}),
    ]),
    development: groupOf(Object.keys(manifest?.devDependencies ?? {})),
  };
}

function ordered(manifests, kind) {
  return [
    ...new Set([
      ...manifests.flatMap(({ production }) => production[kind]),
      ...manifests.flatMap(({ development }) => development[kind]),
    ]),
  ];
}

export function mergeLibraries(manifests) {
  return { validation: ordered(manifests, 'validation'), logger: ordered(manifests, 'logger') };
}

export const ROOT_PACKAGE = '.';
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function hasLibraries({ production, development }) {
  return [production, development].some((group) =>
    Object.values(group).some((ids) => ids.length > 0),
  );
}

function packageDirectories(projectRoot, isExcluded) {
  function relativeOf(absolute) {
    return path.relative(projectRoot, absolute).split(path.sep).join('/');
  }
  return [
    ROOT_PACKAGE,
    ...[
      ...projectFilesUnder(projectRoot, {
        skipDirectory: (absolute, entry) =>
          SKIPPED_FOLDERS.has(entry.name) || isExcluded(`${relativeOf(absolute)}/package.json`),
      }),
    ]
      .map(relativeOf)
      .filter((file) => file.endsWith('/package.json') && !isExcluded(file))
      .map((file) => path.posix.dirname(file)),
  ].toSorted();
}

export function detectLibraries(projectRoot, isExcluded = () => false) {
  const packages = Object.fromEntries(
    existsSync(projectRoot)
      ? packageDirectories(projectRoot, isExcluded)
          .map((directory) => [
            directory,
            manifestLibraries(readManifest(path.join(projectRoot, directory))),
          ])
          .filter(([, libraries]) => hasLibraries(libraries))
      : [],
  );
  return {
    ...mergeLibraries(packages[ROOT_PACKAGE] === undefined ? [] : [packages[ROOT_PACKAGE]]),
    packages,
  };
}

export function validationBehavior(libraries) {
  const detected = (libraries?.validation ?? [])
    .map((id) => VALIDATION_LIBRARIES.find((library) => library.id === id))
    .filter((library) => library !== undefined);
  const accepted = detected.length === 0 ? [DEFAULT_VALIDATION] : detected;
  const [primary] = accepted;
  return {
    name: primary.id,
    phrase: primary.phrase,
    call: primary.call,
    example: primary.example,
    accepted,
  };
}

export function loggerShapes(libraries) {
  const shapes = (libraries?.logger ?? [])
    .map((id) => LOGGER_LIBRARIES.find((library) => library.id === id)?.shape)
    .filter((shape) => shape !== undefined);
  return shapes.length === 0 ? ['err-field'] : [...new Set(shapes)];
}
