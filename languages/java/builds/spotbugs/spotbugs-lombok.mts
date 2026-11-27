import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { ancestorDirectories } from '../../../../shared/filesystem.mts';
import { zipEntryOf } from '../../../../shared/archives/zip-entry.mts';
import { textOf } from '../../../../shared/values/readers.mts';
import { LOMBOK_WITHOUT_CLASSES, LOMBOK_WRITES } from './spotbugs-patterns.mts';

export type ProcessorKind = 'none' | 'lombok' | 'other';

const PROCESSOR_SERVICE = 'META-INF/services/javax.annotation.processing.Processor';
const CONFIG = 'lombok.config';
const LOMBOK_PROCESSOR = 'lombok.';
const FILE_WRITERS: readonly string[] = [
  'com.google.auto.service.processor.',
  'com.google.auto.value.',
  'com.google.auto.factory.',
  'dagger.internal.codegen.',
  'dagger.hilt.',
  'org.immutables.',
  'org.mapstruct.ap.',
  'org.hibernate.jpamodelgen.',
  'org.hibernate.processor.',
  'org.springframework.boot.configurationprocessor.',
  'org.springframework.boot.autoconfigureprocessor.',
  'org.springframework.context.index.processor.',
  'picocli.codegen.',
  'org.apache.logging.log4j.core.config.plugins.processor.',
  'org.openjdk.jmh.generators.',
  'com.querydsl.apt.',
];
const LOMBOK_ARTIFACTS = new Set(['org.projectlombok:lombok']);
const FILE_WRITER_ARTIFACTS = new Set([
  'org.projectlombok:lombok-mapstruct-binding',
  'com.google.auto.service:auto-service',
  'com.google.auto.value:auto-value',
  'com.google.auto.factory:auto-factory',
  'com.google.dagger:dagger-compiler',
  'com.google.dagger:hilt-compiler',
  'org.immutables:value',
  'org.immutables:value-processor',
  'org.mapstruct:mapstruct-processor',
  'org.hibernate:hibernate-jpamodelgen',
  'org.hibernate.orm:hibernate-jpamodelgen',
  'org.hibernate.orm:hibernate-processor',
  'org.springframework.boot:spring-boot-configuration-processor',
  'org.springframework.boot:spring-boot-autoconfigure-processor',
  'org.springframework:spring-context-indexer',
  'info.picocli:picocli-codegen',
  'org.openjdk.jmh:jmh-generator-annprocess',
  'com.querydsl:querydsl-apt',
]);
const GENERATED_KEY = 'lombok.addlombokgeneratedannotation';
const STOP_KEY = 'config.stopbubbling';
const SETTING = /^([\w.]+)\s*=(.*)$/u;
const CLEAR = /^clear\s+([\w.]+)$/iu;
const IMPORT = /^import\s(.+)$/iu;
const UNFOLLOWED_IMPORT = /[<>~!$]/u;
const RENAMING =
  /^(?:clear\s+)?(?:lombok\.accessors\.(?:fluent|prefix|capitalization)|lombok\.getter\.noisprefix)\b/iu;

type Marked = boolean | undefined;
type Unreadable = { readonly unreadable: unknown };
type Entry = { readonly line: string; readonly config: string; readonly seen: ReadonlySet<string> };

const OTHER: ProcessorKind = 'other';
const LOMBOK: ProcessorKind = 'lombok';
const LINE_END = /\r\n|\r|\n/u;

function isUnreadable(value: readonly unknown[] | Unreadable): value is Unreadable {
  return 'unreadable' in value;
}

function meaningfulLines(text: string): string[] {
  return text
    .split(LINE_END)
    .map((line) => line.replace(/#.*/u, '').trim())
    .filter((line) => line.length > 0);
}

function readProcessors(entry: string): string[] {
  if (!existsSync(entry)) {
    return [];
  }
  if (statSync(entry).isDirectory()) {
    const service = path.join(entry, PROCESSOR_SERVICE);
    return existsSync(service) ? meaningfulLines(readFileSync(service, 'utf8')) : [];
  }
  const service = zipEntryOf(entry, PROCESSOR_SERVICE);
  return service === undefined ? [] : meaningfulLines(service);
}

function readable(read: () => string[]): string[] | Unreadable {
  try {
    return read();
  } catch (error) {
    return { unreadable: error };
  }
}

function processorsOf(entry: string): string[] | Unreadable {
  return readable(() => readProcessors(entry));
}

function writesFilesOnly(name: string): boolean {
  return FILE_WRITERS.some((prefix) => name.startsWith(prefix));
}

function kindOf(names: readonly string[]): ProcessorKind {
  const changing = names.filter((name) => !writesFilesOnly(name));
  if (changing.length === 0) {
    return 'none';
  }
  return changing.every((name) => name.startsWith(LOMBOK_PROCESSOR)) ? LOMBOK : OTHER;
}

export function processorKind(entries: readonly string[]): ProcessorKind {
  const found = entries.map(processorsOf);
  const names: string[] = [];
  for (const each of found) {
    if (isUnreadable(each)) {
      return OTHER;
    }
    for (const name of each) {
      names.push(name);
    }
  }
  return kindOf(names);
}

export function declaredProcessorKind(coordinates: readonly string[]): ProcessorKind {
  const artifacts = coordinates.map((coordinate) => coordinate.split(':').slice(0, 2).join(':'));
  if (
    artifacts.some(
      (artifact) => !(LOMBOK_ARTIFACTS.has(artifact) || FILE_WRITER_ARTIFACTS.has(artifact)),
    )
  ) {
    return OTHER;
  }
  return artifacts.some((artifact) => LOMBOK_ARTIFACTS.has(artifact)) ? LOMBOK : 'none';
}

function linesOf(config: string): string[] | Unreadable {
  return readable(() => meaningfulLines(readFileSync(config, 'utf8')));
}

function flag(value: string): Marked {
  const lowered = value.trim().toLowerCase();
  if (lowered === 'true' || lowered === 'false') {
    return lowered === 'true';
  }
  return undefined;
}

function imported(config: string, target: string): string | undefined {
  const trimmed = target.trim();
  if (UNFOLLOWED_IMPORT.test(trimmed)) {
    return undefined;
  }
  const file = path.resolve(path.dirname(config), trimmed);
  return statSync(file, { throwIfNoEntry: false })?.isDirectory() === true
    ? path.resolve(file, CONFIG)
    : file;
}

function entriesOf(config: string, seen: ReadonlySet<string>): Entry[] | Unreadable {
  const lines = linesOf(config);
  if (isUnreadable(lines)) {
    return lines;
  }
  if (seen.has(config)) {
    return { unreadable: config };
  }
  const inside = new Set([...seen, config]);
  return lines.map((line) => ({ line, config, seen: inside }));
}

type Position = { readonly queue: Entry[]; readonly index: number; readonly byDefault: boolean };

function isSetting(line: string, key: string): boolean {
  return textOf(SETTING.exec(line)?.[1]).toLowerCase() === key;
}

function settingValue(line: string): Marked {
  return flag(textOf(SETTING.exec(line)?.[2]));
}

function importEntry(entry: Entry, value: Marked, { queue, index }: Position): Marked {
  const file = imported(entry.config, textOf(IMPORT.exec(entry.line)?.[1]));
  const nested = file === undefined ? undefined : entriesOf(file, entry.seen);
  if (nested === undefined || isUnreadable(nested)) {
    return undefined;
  }
  const rest = queue.splice(index + 1);
  for (const item of [...nested, ...rest]) {
    queue.push(item);
  }
  return value;
}

function applyEntry(entry: Entry, value: Marked, position: Position): Marked {
  const cleared = CLEAR.exec(entry.line);
  if (cleared !== null) {
    return textOf(cleared[1]).toLowerCase() === GENERATED_KEY ? position.byDefault : value;
  }
  if (IMPORT.test(entry.line)) {
    return importEntry(entry, value, position);
  }
  return isSetting(entry.line, GENERATED_KEY) ? settingValue(entry.line) : value;
}

function applied(config: string, marked: Marked, byDefault: boolean): Marked {
  const first = entriesOf(config, new Set());
  if (isUnreadable(first)) {
    return undefined;
  }
  const queue = first;
  let value = marked;
  for (const [index, entry] of queue.entries()) {
    value = applyEntry(entry, value, { queue, index, byDefault });
  }
  return value;
}

function stopsBubbling(config: string): boolean {
  const lines = linesOf(config);
  return (isUnreadable(lines) ? [] : lines).some(
    (line) => isSetting(line, STOP_KEY) && settingValue(line) === true,
  );
}

function configsAbove(directory: string): string[] {
  const found: string[] = [];
  for (const current of ancestorDirectories(directory)) {
    const config = path.join(current, CONFIG);
    if (!existsSync(config)) {
      continue;
    }
    found.unshift(config);
    if (stopsBubbling(config)) {
      return found;
    }
  }
  return found;
}

function importsIn(config: string, lines: readonly string[]): string[] {
  return lines.flatMap((line) => {
    const importing = IMPORT.exec(line);
    const file = importing === null ? undefined : imported(config, textOf(importing[1]));
    return file === undefined ? [] : [file];
  });
}

function renames(start: string): boolean {
  const visited = new Set<string>();
  const pending = [start];
  for (const config of pending) {
    const lines = linesOf(config);
    if (visited.has(config) || isUnreadable(lines)) {
      continue;
    }
    visited.add(config);
    if (lines.some((line) => RENAMING.test(line))) {
      return true;
    }
    for (const file of importsIn(config, lines)) {
      pending.push(file);
    }
  }
  return false;
}

function markedIn(directory: string, byDefault: boolean): Marked {
  const configs = configsAbove(directory);
  if (configs.some((config) => renames(config))) {
    return undefined;
  }
  return configs.reduce((value: Marked, config) => applied(config, value, byDefault), byDefault);
}

export function lombokMarksGenerated(sources: readonly string[], byDefault = true): boolean {
  const directories = new Set(sources.map((source) => path.dirname(path.resolve(source))));
  return [...directories].every((directory) => markedIn(directory, byDefault) === true);
}

export function withoutLombokWrites(
  patterns: readonly string[],
  compiled: boolean,
): readonly string[] {
  const written = compiled ? LOMBOK_WRITES : [...LOMBOK_WITHOUT_CLASSES, ...LOMBOK_WRITES];
  return patterns.filter((pattern) => !written.some((prefix) => pattern.startsWith(prefix)));
}
