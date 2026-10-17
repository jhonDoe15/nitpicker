import {
  listProjectFiles,
  readProjectFile,
  tomlTable,
} from '../../adapters/configuration/project-files.mjs';

const REQUIREMENT_FOLDERS = ['requirements', 'requirements-dev', 'reqs'];
const REQUIREMENT_FILE = /\.(?:txt|in)$/u;
const ROOT_REQUIREMENT_FILE = /^requirements.*\.(?:txt|in)$/u;
const DISTRIBUTION_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*/u;
const LOGGING_LIBRARIES = ['structlog', 'loguru'];
const VALIDATORS = [
  { name: 'pydantic', packages: ['pydantic', 'pydantic_settings'] },
  { name: 'msgspec', packages: ['msgspec'] },
  { name: 'cattrs', packages: ['cattrs', 'cattr'] },
  { name: 'marshmallow', packages: ['marshmallow'] },
];

function normalized(requirement) {
  const match = DISTRIBUTION_NAME.exec(requirement.trim());
  return match === null ? undefined : match[0].toLowerCase().replaceAll(/[-.]/gu, '_');
}

function stringsOf(value) {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(stringsOf);
  }
  return value !== null && typeof value === 'object' ? Object.values(value).flatMap(stringsOf) : [];
}

function keysOf(value) {
  return value !== null && typeof value === 'object' ? Object.keys(value) : [];
}

function pyprojectNames(projectRoot) {
  const table = tomlTable(projectRoot, 'pyproject.toml');
  if (table === undefined) {
    return [];
  }
  const poetry = table.tool?.poetry;
  return [
    ...stringsOf(table.project?.dependencies),
    ...stringsOf(table.project?.['optional-dependencies']),
    ...stringsOf(table['dependency-groups']),
    ...stringsOf(table.tool?.uv?.['dev-dependencies']),
    ...stringsOf(table.tool?.pdm?.['dev-dependencies']),
    ...keysOf(poetry?.dependencies),
    ...Object.values(poetry?.group ?? {}).flatMap((group) => keysOf(group?.dependencies)),
  ];
}

function pipfileNames(projectRoot) {
  const table = tomlTable(projectRoot, 'Pipfile');
  return [...keysOf(table?.packages), ...keysOf(table?.['dev-packages'])];
}

function linesOf(projectRoot, folder, name) {
  return (readProjectFile(projectRoot, [folder, name].filter(Boolean).join('/')) ?? '').split(
    /\r?\n/u,
  );
}

function requirementNames(projectRoot) {
  const inRoot = listProjectFiles(projectRoot, '')
    .filter((name) => ROOT_REQUIREMENT_FILE.test(name))
    .flatMap((name) => linesOf(projectRoot, '', name));
  const inFolders = REQUIREMENT_FOLDERS.flatMap((folder) =>
    listProjectFiles(projectRoot, folder)
      .filter((name) => REQUIREMENT_FILE.test(name))
      .flatMap((name) => linesOf(projectRoot, folder, name)),
  );
  return [...inRoot, ...inFolders];
}

export function dependencyNames(projectRoot) {
  const raw = [
    ...pyprojectNames(projectRoot),
    ...pipfileNames(projectRoot),
    ...requirementNames(projectRoot),
  ];
  return new Set(raw.map(normalized).filter((name) => name !== undefined));
}

export function detectLibraries(projectRoot) {
  const names = dependencyNames(projectRoot);
  const validator = VALIDATORS.find(({ packages }) => packages.some((name) => names.has(name)));
  return {
    logging: LOGGING_LIBRARIES.find((name) => names.has(name)) ?? 'logging',
    validator: validator?.name ?? 'pydantic',
  };
}
