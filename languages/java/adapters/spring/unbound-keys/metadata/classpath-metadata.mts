import { readFileSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';
import { valueOr } from '../../spring-config-files.mts';
import { readJarEntries } from './jar-entries.mts';
import {
  fieldOf,
  fieldsOf,
  listOf,
  parseJson,
  textOf,
} from '../../../../../../shared/values/readers.mts';
import type { Fields } from '../../../../../../shared/values/readers.mts';
import { appendAll } from '../../typed/shared-views.mts';
import type { ClasspathMetadata, MetadataProperty } from '../../typed/unbound-types.mts';

const METADATA_FILES = [
  'META-INF/spring-configuration-metadata.json',
  'META-INF/additional-spring-configuration-metadata.json',
];
const BOOT_JAR = /^spring-boot-\d[^/]*\.jar$/u;

function directoryTexts(directory: string): string[] {
  const texts: string[] = [];
  for (const name of METADATA_FILES) {
    appendAll(
      texts,
      valueOr<string[]>([], () => [readFileSync(path.join(directory, name), 'utf8')]),
    );
  }
  return texts;
}

function entryTexts(entry: string): string[] {
  const stats = valueOr<Stats | undefined>(undefined, () => statSync(entry));
  if (stats?.isDirectory()) {
    return directoryTexts(entry);
  }
  return stats?.isFile() && entry.endsWith('.jar')
    ? valueOr<string[]>([], () => readJarEntries(entry, METADATA_FILES).map(({ text }) => text))
    : [];
}

function parsed(text: string): Fields {
  const document = valueOr<unknown>({}, () => parseJson(text));
  return typeof document === 'object' && document !== null ? fieldsOf(document) : {};
}

function propertyOf(property: Fields): MetadataProperty {
  const deprecation = fieldsOf(fieldOf(property, 'deprecation'));
  const replacement = fieldOf(deprecation, 'replacement');
  return {
    name: textOf(fieldOf(property, 'name')),
    type: fieldOf(property, 'type'),
    removed: fieldOf(deprecation, 'level') === 'error',
    ...(typeof replacement === 'string' ? { replacement } : {}),
  };
}

function namedItems(document: Fields, field: string): Fields[] {
  return listOf(fieldOf(document, field))
    .map(fieldsOf)
    .filter((item) => typeof fieldOf(item, 'name') === 'string');
}

export function metadataOf(texts: readonly string[]): ClasspathMetadata {
  const documents = texts.map(parsed);
  return {
    properties: documents.flatMap((document) => namedItems(document, 'properties').map(propertyOf)),
    groups: documents.flatMap((document) =>
      namedItems(document, 'groups').map((group) => textOf(fieldOf(group, 'name'))),
    ),
  };
}

export function readClasspathMetadata(
  classpath: readonly string[],
  directories: readonly string[] = [],
): ClasspathMetadata & { boot: boolean } {
  const entries = [...new Set([...classpath, ...directories])];
  const boot = entries.some((entry) => BOOT_JAR.test(path.basename(entry)));
  return { boot, ...metadataOf(entries.flatMap(entryTexts)) };
}
