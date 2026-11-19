import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isProfileKey, parseProperties, parseYaml } from './spring-config-parser.mts';
import { projectFilesUnder } from './typed/shared-views.mts';
import type { Attempt, ConfigEntry, SpringDocument } from './typed/config-types.mts';

const CONFIG_FILE = /^application(?:-(.+))?\.(properties|ya?ml)$/;
const MAIN_FILES = ['application.properties', 'application.yml', 'application.yaml'];
const PROFILE_SEPARATORS = /[,|&!() ]/;
const SOURCE_EXTENSIONS = ['.java', '.kt'];
const PERSISTENCE_IMPORT = /^\s*import\s+(?:jakarta|javax)\.persistence\./m;

export function stripBracketsAndQuotes(text: string): string {
  return text.replaceAll(/[[\]"']/g, '');
}

function joinPosix(...parts: string[]): string {
  return parts.filter((part) => part !== '').join('/');
}

function attempt<T>(action: () => T): Attempt<T> {
  try {
    return { ok: true, value: action() };
  } catch {
    return { ok: false };
  }
}

export function valueOr<T>(fallback: T, action: () => T): T {
  const result = attempt(action);
  return result.ok ? result.value : fallback;
}

function readText(file: string): string | undefined {
  return valueOr<string | undefined>(undefined, () => readFileSync(file, 'utf8'));
}

function configFileNames(directory: string): string[] {
  return valueOr<string[]>([], () =>
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && CONFIG_FILE.test(entry.name))
      .map((entry) => entry.name)
      .sort(),
  );
}

function directoryKey(absolute: string): string {
  return valueOr(path.resolve(absolute), () => realpathSync(absolute));
}

export function readSpringDocuments(
  projectRoot: string,
  resourceRoots: readonly string[],
): SpringDocument[] {
  const seen = new Set<string>();
  return resourceRoots
    .flatMap((root) => {
      const directory = path.posix.normalize(root.replaceAll('\\', '/')).replace(/\/+$/, '');
      return [directory, path.posix.normalize(joinPosix(directory, 'config'))];
    })
    .filter((relative) => {
      const key = directoryKey(path.resolve(projectRoot, relative));
      const fresh = !seen.has(key);
      seen.add(key);
      return fresh;
    })
    .flatMap((relative) => directoryDocuments(projectRoot, relative));
}

function directoryDocuments(projectRoot: string, relative: string): SpringDocument[] {
  const absolute = path.join(projectRoot, relative);
  return configFileNames(absolute).flatMap((name) =>
    fileDocuments(absolute, joinPosix(relative, name), name),
  );
}

function fileDocuments(
  absoluteDirectory: string,
  relativePath: string,
  name: string,
): SpringDocument[] {
  const text = readText(path.join(absoluteDirectory, name));
  return text === undefined ? [] : textDocuments(text, relativePath, name);
}

function textDocuments(text: string, relativePath: string, name: string): SpringDocument[] {
  const [, fileProfile, extension] = CONFIG_FILE.exec(name) ?? [];
  const parsed = extension === 'properties' ? parseProperties(text) : parseYaml(text);
  return parsed.map((document) => ({
    path: relativePath,
    main: MAIN_FILES.includes(name),
    fileProfile: fileProfile?.toLowerCase(),
    ...documentProfiles(document.entries, fileProfile),
    entries: document.entries,
  }));
}

function documentProfiles(
  entries: readonly ConfigEntry[],
  fileProfile: string | undefined,
): { profiles: string[]; negated: boolean } {
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

function sourceFiles(directory: string): string[] {
  return projectFilesUnder(directory).filter((file) =>
    SOURCE_EXTENSIONS.some((extension) => file.endsWith(extension)),
  );
}

export function usesJpa(projectRoot: string, sourceRoots: readonly string[]): boolean {
  return sourceRoots.some((root) =>
    sourceFiles(path.join(projectRoot, root)).some((file) =>
      PERSISTENCE_IMPORT.test(readText(file) ?? ''),
    ),
  );
}
