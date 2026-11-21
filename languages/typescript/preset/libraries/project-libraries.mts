import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../shared/project-files/project-files.mts';
import { fieldOf, fieldsOf } from '../../../../shared/values/readers.mts';
import type {
  DetectedLibraries,
  LibraryIds,
  ManifestLibraries,
  ProjectLibraries,
  ValidationBehavior,
  ValidationLibrary,
} from './typed/library-types.mts';
import { readManifest } from '../eslint-config/scope-support.mts';
import { LOGGER_LIBRARIES } from './logger-libraries.mts';
import { VALIDATION_LIBRARIES } from './validation-libraries.mts';

type SkipDirectory = {
  skipDirectory: (absolute: string, entry: { readonly name: string }) => boolean;
};

const projectFilesUnder: (root: string, options: SkipDirectory) => string[] =
  untypedProjectFilesUnder;

const DEFAULT_VALIDATION = VALIDATION_LIBRARIES[0];

function idsPresent(
  table: readonly { readonly id: string; readonly packages: readonly string[] }[],
  names: readonly string[],
): string[] {
  return table
    .filter(({ packages }) => packages.some((name) => names.includes(name)))
    .map(({ id }) => id);
}

function groupOf(names: readonly string[]): LibraryIds {
  return {
    validation: idsPresent(VALIDATION_LIBRARIES, names),
    logger: idsPresent(LOGGER_LIBRARIES, names),
  };
}

function manifestLibraries(manifest: unknown): ManifestLibraries {
  function namesIn(field: string): string[] {
    return Object.keys(fieldsOf(fieldOf(manifest, field)));
  }
  return {
    production: groupOf([
      ...namesIn('dependencies'),
      ...namesIn('peerDependencies'),
      ...namesIn('optionalDependencies'),
    ]),
    development: groupOf(namesIn('devDependencies')),
  };
}

function ordered(manifests: readonly ManifestLibraries[], kind: keyof LibraryIds): string[] {
  return [
    ...new Set([
      ...manifests.flatMap(({ production }) => production[kind]),
      ...manifests.flatMap(({ development }) => development[kind]),
    ]),
  ];
}

export function mergeLibraries(manifests: readonly ManifestLibraries[]): LibraryIds {
  return { validation: ordered(manifests, 'validation'), logger: ordered(manifests, 'logger') };
}

export const ROOT_PACKAGE = '.';
const SKIPPED_FOLDERS = new Set(['node_modules', '.git']);

function hasLibraries({ production, development }: ManifestLibraries): boolean {
  return [production, development].some((group) =>
    Object.values(group).some((ids) => ids.length > 0),
  );
}

function packageDirectories(projectRoot: string, isExcluded: (file: string) => boolean): string[] {
  function relativeOf(absolute: string): string {
    return path.relative(projectRoot, absolute).split(path.sep).join('/');
  }
  return [
    ROOT_PACKAGE,
    ...[
      ...projectFilesUnder(projectRoot, {
        skipDirectory: (absolute: string, entry: { readonly name: string }) =>
          SKIPPED_FOLDERS.has(entry.name) || isExcluded(`${relativeOf(absolute)}/package.json`),
      }),
    ]
      .map(relativeOf)
      .filter((file) => file.endsWith('/package.json') && !isExcluded(file))
      .map((file) => path.posix.dirname(file)),
  ].toSorted();
}

export function detectLibraries(
  projectRoot: string,
  isExcluded: (file: string) => boolean = () => false,
): DetectedLibraries {
  const packages = Object.fromEntries(
    existsSync(projectRoot)
      ? packageDirectories(projectRoot, isExcluded)
          .map((directory): [string, ManifestLibraries] => [
            directory,
            manifestLibraries(readManifest(path.join(projectRoot, directory))),
          ])
          .filter(([, libraries]) => hasLibraries(libraries))
      : [],
  );
  const rootLibraries = packages[ROOT_PACKAGE];
  return {
    ...mergeLibraries(rootLibraries === undefined ? [] : [rootLibraries]),
    packages,
  };
}

export function validationBehavior(
  libraries: Pick<ProjectLibraries, 'validation'> | undefined,
): ValidationBehavior {
  const detected = (libraries?.validation ?? [])
    .map((id) => VALIDATION_LIBRARIES.find((library) => library.id === id))
    .filter((library) => library !== undefined);
  const accepted: readonly ValidationLibrary[] =
    detected.length === 0 ? [DEFAULT_VALIDATION] : detected;
  const primary = accepted[0] ?? DEFAULT_VALIDATION;
  return {
    name: primary.id,
    phrase: primary.phrase,
    call: primary.call,
    example: primary.example,
    accepted,
  };
}

export function loggerShapes(libraries: Pick<ProjectLibraries, 'logger'> | undefined): string[] {
  const shapes = (libraries?.logger ?? [])
    .map((id) => LOGGER_LIBRARIES.find((library) => library.id === id)?.shape)
    .filter((shape) => shape !== undefined);
  return shapes.length === 0 ? ['err-field'] : [...new Set(shapes)];
}
