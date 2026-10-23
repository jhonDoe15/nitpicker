import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { isProfileKey, parseProperties, parseYaml } from './spring-config-parser.mjs';

const CONFIG_FILE = /^application(?:-(.+))?\.(properties|ya?ml)$/;
const MAIN_FILES = ['application.properties', 'application.yml', 'application.yaml'];
const PROFILE_SEPARATORS = /[,|&!() ]/;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const PERSISTENCE_IMPORT = /^\s*import\s+(?:jakarta|javax)\.persistence\./m;

export function stripBracketsAndQuotes(text) {
  return text.replaceAll(/[[\]"']/g, '');
}

function joinPosix(...parts) {
  return parts.filter((part) => part !== '').join('/');
}

function attempt(action) {
  try {
    return { ok: true, value: action() };
  } catch {
    return { ok: false };
  }
}

export function valueOr(fallback, action) {
  const result = attempt(action);
  return result.ok ? result.value : fallback;
}

function readText(file) {
  return valueOr(undefined, () => readFileSync(file, 'utf8'));
}

function configFileNames(directory) {
  return valueOr([], () =>
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && CONFIG_FILE.test(entry.name))
      .map((entry) => entry.name)
      .sort(),
  );
}

export function readSpringDocuments(projectRoot, resourceRoots) {
  return resourceRoots.flatMap((root) => {
    const directory = root.replaceAll('\\', '/').replace(/\/+$/, '');
    return [directory, joinPosix(directory, 'config')].flatMap((relative) =>
      directoryDocuments(projectRoot, relative),
    );
  });
}

function directoryDocuments(projectRoot, relative) {
  const absolute = path.join(projectRoot, relative);
  return configFileNames(absolute).flatMap((name) =>
    fileDocuments(absolute, joinPosix(relative, name), name),
  );
}

function fileDocuments(absoluteDirectory, relativePath, name) {
  const [, fileProfile, extension] = CONFIG_FILE.exec(name);
  const text = readText(path.join(absoluteDirectory, name));
  if (text === undefined) {
    return [];
  }
  const parsed = extension === 'properties' ? parseProperties(text) : parseYaml(text);
  return parsed.map((document) => ({
    path: relativePath,
    main: MAIN_FILES.includes(name),
    fileProfile: fileProfile?.toLowerCase(),
    ...documentProfiles(document.entries, fileProfile),
    entries: document.entries,
  }));
}

function documentProfiles(entries, fileProfile) {
  const declared = entries
    .filter((entry) => isProfileKey(entry.key))
    .map((entry) => stripBracketsAndQuotes(entry.value).toLowerCase());
  const profiles = declared.flatMap((value) =>
    value.split(PROFILE_SEPARATORS).filter((profile) => profile !== ''),
  );
  if (profiles.length > 0) {
    return { profiles, negated: declared.some((value) => value.includes('!')) };
  }
  return { profiles: fileProfile === undefined ? [] : [fileProfile.toLowerCase()], negated: false };
}

function sourceFiles(directory) {
  return valueOr([], () =>
    readdirSync(directory, { recursive: true })
      .map(String)
      .filter((file) => SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension))),
  );
}

export function usesJpa(projectRoot, sourceRoots) {
  return sourceRoots.some((root) => {
    const absolute = path.join(projectRoot, root);
    return sourceFiles(absolute).some((file) =>
      PERSISTENCE_IMPORT.test(readText(path.join(absolute, file)) ?? ''),
    );
  });
}
