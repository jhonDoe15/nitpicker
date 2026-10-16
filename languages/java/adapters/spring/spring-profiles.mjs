import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readSpringDocuments, valueOr } from './spring-config-files.mjs';
import { relaxKey } from './spring-config-parser.mjs';

const DEFAULT_TEST_SOURCE_ROOTS = ['src/test/java', 'src/test/kotlin'];
const DEFAULT_TEST_RESOURCE_ROOTS = ['src/test/resources'];
const TEST_SOURCE_FILE = /\.(?:java|kt|kts)$/;
const ACTIVE_PROFILES_ANNOTATION = /@ActiveProfiles\s*\(([^)]*)\)/g;
const ACTIVE_PROFILES_PROPERTY = /spring\.profiles\.active\s*[=:]\s*["']?([\w.,-]+)/g;
const STRING_LITERAL = /"([^"]+)"/g;
const ACTIVE_KEY = relaxKey('spring.profiles.active');
const LOCAL_WORDS = new Set(['local', 'dev', 'development']);
const TEST_WORDS = new Set(['test', 'tests', 'it', 'integration']);
const PRODUCTION_WORDS = new Set(['prod', 'production', 'live']);

function words(profile) {
  return profile.split(/[-_.]/).filter((word) => word !== '');
}

function mentionsAny(profile, set) {
  return words(profile).some((word) => set.has(word));
}

function isTestProfile(profile, detected) {
  return (
    profile.startsWith('test') ||
    mentionsAny(profile, TEST_WORDS) ||
    (detected.has(profile) && !mentionsAny(profile, PRODUCTION_WORDS))
  );
}

function isLocalProfile(profile) {
  return mentionsAny(profile, LOCAL_WORDS);
}

function exemptWhenEvery(document, matches) {
  return (
    !document.negated && document.profiles.length > 0 && document.profiles.every((p) => matches(p))
  );
}

export function withProfileKinds(documents, detected) {
  return documents.map((document) => ({
    ...document,
    testOnly: exemptWhenEvery(document, (profile) => isTestProfile(profile, detected)),
    testOrLocalOnly: exemptWhenEvery(
      document,
      (profile) => isTestProfile(profile, detected) || isLocalProfile(profile),
    ),
  }));
}

function listFiles(directory) {
  return valueOr([], () =>
    readdirSync(directory, { recursive: true })
      .map(String)
      .filter((file) => TEST_SOURCE_FILE.test(file)),
  );
}

function readText(file) {
  return valueOr('', () => readFileSync(file, 'utf8'));
}

function profileList(text) {
  return text
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');
}

function activeProfilesIn(text) {
  const annotated = [...text.matchAll(ACTIVE_PROFILES_ANNOTATION)].flatMap(([, body]) =>
    [...body.matchAll(STRING_LITERAL)].flatMap(([, value]) => profileList(value)),
  );
  const configured = [...text.matchAll(ACTIVE_PROFILES_PROPERTY)].flatMap(([, value]) =>
    profileList(value),
  );
  return [...annotated, ...configured];
}

function resourceRootsFor(testSourceRoots) {
  const siblings = testSourceRoots
    .map((root) => root.replaceAll('\\', '/').replace(/\/+$/, ''))
    .filter((root) => /\/(?:java|kotlin)$/.test(root))
    .map((root) => root.replace(/\/(?:java|kotlin)$/, '/resources'));
  return [...new Set([...DEFAULT_TEST_RESOURCE_ROOTS, ...siblings])];
}

function resourceProfiles(documents) {
  return documents.flatMap((document) => [
    ...(document.negated ? [] : document.profiles),
    ...document.entries
      .filter((entry) => relaxKey(entry.key) === ACTIVE_KEY)
      .flatMap((entry) => profileList(entry.value.replaceAll(/[[\]"']/g, ''))),
  ]);
}

export function readTestProfiles(projectRoot, testSourceRoots) {
  const sourceRoots = testSourceRoots?.length > 0 ? testSourceRoots : DEFAULT_TEST_SOURCE_ROOTS;
  const fromSources = sourceRoots.flatMap((root) => {
    const absolute = path.join(projectRoot, root);
    return listFiles(absolute).flatMap((file) =>
      activeProfilesIn(readText(path.join(absolute, file))),
    );
  });
  const documents = readSpringDocuments(projectRoot, resourceRootsFor(sourceRoots));
  return new Set([...fromSources, ...resourceProfiles(documents)]);
}
