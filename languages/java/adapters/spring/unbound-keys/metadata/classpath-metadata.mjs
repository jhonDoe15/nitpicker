import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { valueOr } from '../../spring-config-files.mjs';
import { readJarEntries } from './jar-entries.mjs';

const METADATA_FILES = [
  'META-INF/spring-configuration-metadata.json',
  'META-INF/additional-spring-configuration-metadata.json',
];
const BOOT_JAR = /^spring-boot-\d[^/]*\.jar$/u;

function directoryTexts(directory) {
  const texts = [];
  for (const name of METADATA_FILES) {
    texts.push(...valueOr([], () => [readFileSync(path.join(directory, name), 'utf8')]));
  }
  return texts;
}

function entryTexts(entry) {
  const stats = valueOr(undefined, () => statSync(entry));
  if (stats?.isDirectory()) {
    return directoryTexts(entry);
  }
  return stats?.isFile() && entry.endsWith('.jar')
    ? valueOr([], () => readJarEntries(entry, METADATA_FILES).map(({ text }) => text))
    : [];
}

function parsed(text) {
  return valueOr({}, () => JSON.parse(text));
}

function propertyOf(property) {
  const deprecation = property.deprecation ?? {};
  return {
    name: property.name,
    type: property.type,
    removed: deprecation.level === 'error',
    ...(typeof deprecation.replacement === 'string'
      ? { replacement: deprecation.replacement }
      : {}),
  };
}

function namedItems(document, field) {
  const items = document[field];
  return Array.isArray(items) ? items.filter((item) => typeof item?.name === 'string') : [];
}

export function metadataOf(texts) {
  const documents = texts.map(parsed);
  return {
    properties: documents.flatMap((document) => namedItems(document, 'properties').map(propertyOf)),
    groups: documents.flatMap((document) =>
      namedItems(document, 'groups').map((group) => group.name),
    ),
  };
}

export function readClasspathMetadata(classpath, directories = []) {
  const entries = [...new Set([...classpath, ...directories])];
  const boot = entries.some((entry) => BOOT_JAR.test(path.basename(entry)));
  return { boot, ...metadataOf(entries.flatMap(entryTexts)) };
}
