import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZipOrFailure } from '../../../../shared/archives/zip-entries.mts';

export type ProcessorKind = 'none' | 'lombok' | 'other';

const PROCESSOR_SERVICE = 'META-INF/services/javax.annotation.processing.Processor';
const CONFIG = 'lombok.config';
const NOT_MARKED = /^\s*lombok\.addLombokGeneratedAnnotation\s*=\s*false\s*$/imu;
const IMPORTS = /^\s*import\s/imu;

function namesIn(service: string): string[] {
  return service
    .split('\n')
    .map((line) => line.replace(/#.*/u, '').trim())
    .filter((line) => line.length > 0);
}

function processorsOf(entry: string): string[] | undefined {
  try {
    return readProcessors(entry);
  } catch {
    return undefined;
  }
}

function readProcessors(entry: string): string[] | undefined {
  if (!existsSync(entry)) {
    return [];
  }
  if (statSync(entry).isDirectory()) {
    const service = path.join(entry, PROCESSOR_SERVICE);
    return existsSync(service) ? namesIn(readFileSync(service, 'utf8')) : [];
  }
  const read = readZipOrFailure(entry);
  if (read.kind !== 'zip') {
    return undefined;
  }
  if (!read.zip.names.has(PROCESSOR_SERVICE)) {
    return [];
  }
  const service = read.zip.text(PROCESSOR_SERVICE);
  return service === undefined ? undefined : namesIn(service);
}

export function processorKind(entries: readonly string[]): ProcessorKind {
  const found = entries.map(processorsOf);
  if (found.some((names) => names === undefined)) {
    return 'other';
  }
  const names = found.flatMap((each) => each ?? []);
  if (names.length === 0) {
    return 'none';
  }
  return names.every((name) => name.startsWith('lombok.')) ? 'lombok' : 'other';
}

function configsAbove(directory: string, seen: Set<string>): string[] {
  const found: string[] = [];
  let current = directory;
  while (!seen.has(current)) {
    seen.add(current);
    const config = path.join(current, CONFIG);
    if (existsSync(config)) {
      found.push(config);
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return found;
}

export function lombokMarksGenerated(sources: readonly string[]): boolean {
  const seen = new Set<string>();
  const configs = sources.flatMap((source) =>
    configsAbove(path.dirname(path.resolve(source)), seen),
  );
  return configs.every((config) => {
    try {
      const text = readFileSync(config, 'utf8');
      return !NOT_MARKED.test(text) && !IMPORTS.test(text);
    } catch {
      return false;
    }
  });
}
