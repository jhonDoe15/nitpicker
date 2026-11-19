import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readSpringDocuments, valueOr } from './spring-config-files.mts';
import { relaxKey } from './spring-config-parser.mts';
import { hasLocalWord, hasTestWord, isProductionLike } from './profile-words.mts';
import { projectFilePaths } from './typed/shared-views.mts';
import type { ProfileKinds, ProfiledDocument, SpringDocument } from './typed/config-types.mts';

const DEFAULT_TEST_SOURCE_ROOTS = ['src/test/java', 'src/test/kotlin'];
const DEFAULT_TEST_RESOURCE_ROOTS = ['src/test/resources'];
const TEST_SOURCE_FILE = /\.(?:java|kt|kts)$/;
const ACTIVE_PROFILES_ANNOTATION = /@ActiveProfiles\s*\(([^)]*)\)/g;
const ACTIVE_PROFILES_PROPERTY = /spring\.profiles\.active\s*[=:]\s*["']?([\w.,-]+)/g;
const STRING_LITERAL = /"([^"]+)"/g;
const ACTIVE_KEY = relaxKey('spring.profiles.active');

function isTestProfile(profile: string, { detected, mainFiles }: ProfileKinds): boolean {
  const name = profile.toLowerCase();
  return (
    !isProductionLike(name) && (hasTestWord(name) || (detected.has(name) && !mainFiles.has(name)))
  );
}

function isLocalProfile(profile: string): boolean {
  return !isProductionLike(profile) && hasLocalWord(profile);
}

function exemptWhenEvery(document: SpringDocument, matches: (profile: string) => boolean): boolean {
  return (
    !document.negated && document.profiles.length > 0 && document.profiles.every((p) => matches(p))
  );
}

export function withProfileKinds(
  documents: readonly SpringDocument[],
  detected: ReadonlySet<string>,
): ProfiledDocument[] {
  const mainFiles = new Set(
    documents
      .map(({ fileProfile }) => fileProfile)
      .filter((profile): profile is string => Boolean(profile)),
  );
  const test: ProfileKinds = { detected, mainFiles };
  return documents.map((document) => ({
    ...document,
    testOnly: exemptWhenEvery(document, (profile) => isTestProfile(profile, test)),
    testOrLocalOnly: exemptWhenEvery(
      document,
      (profile) => isTestProfile(profile, test) || isLocalProfile(profile),
    ),
  }));
}

function listFiles(directory: string): string[] {
  return projectFilePaths(directory).filter((file) => TEST_SOURCE_FILE.test(file));
}

function readText(file: string): string {
  return valueOr('', () => readFileSync(file, 'utf8'));
}

function profileList(text: string): string[] {
  return text
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
}

function activeProfilesIn(text: string): string[] {
  const annotated = [...text.matchAll(ACTIVE_PROFILES_ANNOTATION)].flatMap(([, body = '']) =>
    [...body.matchAll(STRING_LITERAL)].flatMap(([, value = '']) => profileList(value)),
  );
  const configured = [...text.matchAll(ACTIVE_PROFILES_PROPERTY)].flatMap(([, value = '']) =>
    profileList(value),
  );
  return [...annotated, ...configured];
}

function resourceRootsFor(testSourceRoots: readonly string[]): string[] {
  const siblings = testSourceRoots
    .map((root) => root.replaceAll('\\', '/').replace(/\/+$/, ''))
    .filter((root) => /\/(?:java|kotlin)$/.test(root))
    .map((root) => root.replace(/\/(?:java|kotlin)$/, '/resources'));
  return [...new Set([...DEFAULT_TEST_RESOURCE_ROOTS, ...siblings])];
}

export function testSourceRootsOr(
  testSourceRoots: readonly string[] | undefined,
): readonly string[] {
  return testSourceRoots !== undefined && testSourceRoots.length > 0
    ? testSourceRoots
    : DEFAULT_TEST_SOURCE_ROOTS;
}

export function testResourceRoots(testSourceRoots: readonly string[] | undefined): string[] {
  return resourceRootsFor(testSourceRootsOr(testSourceRoots));
}

function resourceProfiles(documents: readonly SpringDocument[]): string[] {
  return documents.flatMap((document) => [
    ...(document.negated ? [] : document.profiles),
    ...document.entries
      .filter((entry) => relaxKey(entry.key) === ACTIVE_KEY)
      .flatMap((entry) => profileList(entry.value.replaceAll(/[[\]"']/g, ''))),
  ]);
}

export function readTestProfiles(
  projectRoot: string,
  testSourceRoots: readonly string[] | undefined,
): Set<string> {
  const sourceRoots = testSourceRootsOr(testSourceRoots);
  const fromSources = sourceRoots.flatMap((root) => {
    const absolute = path.join(projectRoot, root);
    return listFiles(absolute).flatMap((file) =>
      activeProfilesIn(readText(path.join(absolute, file))),
    );
  });
  const documents = readSpringDocuments(projectRoot, resourceRootsFor(sourceRoots));
  return new Set([...fromSources, ...resourceProfiles(documents)]);
}
