import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { zipEntryOf } from '../../../../shared/archives/zip-entry.mts';

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
const SETTING = /^([\w.]+)\s*=\s*(.*)$/u;
const CLEAR = /^clear\s+([\w.]+)$/iu;
const IMPORT = /^import\s+(.+)$/iu;
const UNFOLLOWED_IMPORT = /[<>~!$]/u;
const RENAMING =
  /^(?:clear\s+)?(?:lombok\.accessors\.(?:fluent|prefix|capitalization)|lombok\.getter\.noisprefix)\b/iu;

type Marked = boolean | undefined;

const UNREADABLE = 'unreadable';

function namesIn(service: string): string[] {
  return service
    .split('\n')
    .map((line) => line.replace(/#.*/u, '').trim())
    .filter((line) => line.length > 0);
}

function processorsOf(entry: string): string[] | typeof UNREADABLE {
  try {
    return readProcessors(entry);
  } catch {
    return UNREADABLE;
  }
}

function readProcessors(entry: string): string[] {
  if (!existsSync(entry)) {
    return [];
  }
  if (statSync(entry).isDirectory()) {
    const service = path.join(entry, PROCESSOR_SERVICE);
    return existsSync(service) ? namesIn(readFileSync(service, 'utf8')) : [];
  }
  const service = zipEntryOf(entry, PROCESSOR_SERVICE);
  return service === undefined ? [] : namesIn(service);
}

function writesFilesOnly(name: string): boolean {
  return FILE_WRITERS.some((prefix) => name.startsWith(prefix));
}

function kindOf(names: readonly string[]): ProcessorKind {
  const changing = names.filter((name) => !writesFilesOnly(name));
  if (changing.length === 0) {
    return 'none';
  }
  return changing.every((name) => name.startsWith(LOMBOK_PROCESSOR)) ? 'lombok' : 'other';
}

export function processorKind(entries: readonly string[]): ProcessorKind {
  const found = entries.map(processorsOf);
  const names: string[] = [];
  for (const each of found) {
    if (each === UNREADABLE) {
      return 'other';
    }
    names.push(...each);
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
    return 'other';
  }
  return artifacts.some((artifact) => LOMBOK_ARTIFACTS.has(artifact)) ? 'lombok' : 'none';
}

function linesOf(config: string): string[] | typeof UNREADABLE {
  try {
    return readFileSync(config, 'utf8')
      .split('\n')
      .map((line) => line.replace(/#.*/u, '').trim())
      .filter((line) => line.length > 0);
  } catch {
    return UNREADABLE;
  }
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
    ? path.join(file, CONFIG)
    : file;
}

function applied(config: string, marked: Marked, seen: ReadonlySet<string>): Marked {
  const lines = linesOf(config);
  if (lines === UNREADABLE || seen.has(config)) {
    return undefined;
  }
  const inside = new Set([...seen, config]);
  return lines.reduce((value: Marked, line) => {
    const cleared = CLEAR.exec(line);
    if (cleared !== null) {
      return cleared[1]?.toLowerCase() === GENERATED_KEY ? true : value;
    }
    const importing = IMPORT.exec(line);
    if (importing !== null) {
      const file = imported(config, importing[1] ?? '');
      return file === undefined ? undefined : applied(file, value, inside);
    }
    const setting = SETTING.exec(line);
    return setting?.[1]?.toLowerCase() === GENERATED_KEY ? flag(setting[2] ?? '') : value;
  }, marked);
}

function stopsBubbling(config: string): boolean {
  const lines = linesOf(config);
  return (lines === UNREADABLE ? [] : lines).some((line) => {
    const setting = SETTING.exec(line);
    return setting?.[1]?.toLowerCase() === STOP_KEY && flag(setting[2] ?? '') === true;
  });
}

function configsAbove(directory: string): string[] {
  const found: string[] = [];
  const directories = [directory];
  for (const current of directories) {
    const config = path.join(current, CONFIG);
    if (existsSync(config)) {
      found.unshift(config);
      if (stopsBubbling(config)) {
        return found;
      }
    }
    const parent = path.dirname(current);
    if (parent !== current) {
      directories.push(parent);
    }
  }
  return found;
}

function renames(config: string, seen: ReadonlySet<string>): boolean {
  const lines = linesOf(config);
  if (lines === UNREADABLE || seen.has(config)) {
    return false;
  }
  const inside = new Set([...seen, config]);
  return lines.some((line) => {
    const importing = IMPORT.exec(line);
    const file = importing === null ? undefined : imported(config, importing[1] ?? '');
    return RENAMING.test(line) || (file !== undefined && renames(file, inside));
  });
}

function markedIn(directory: string): Marked {
  const configs = configsAbove(directory);
  if (configs.some((config) => renames(config, new Set()))) {
    return undefined;
  }
  return configs.reduce((value: Marked, config) => applied(config, value, new Set()), true);
}

export function lombokMarksGenerated(sources: readonly string[]): boolean {
  const directories = new Set(sources.map((source) => path.dirname(path.resolve(source))));
  return [...directories].every((directory) => markedIn(directory) === true);
}
