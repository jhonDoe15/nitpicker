import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { readZipOrFailure } from '../../../../shared/archives/zip-entries.mts';

export type ArgumentSet = {
  readonly head: readonly string[];
  readonly sources: readonly string[];
};

const SOURCES = '--sources';
const PROJECT_FLAG = '--errorprone-flag=';
const PROJECT_ARG = '--project-arg=';
const OWN_CLASSES = '--own-classes=';
const GENERATED_ROOT = '--generated-root=';
const RELEASE = '--release=';
const SOURCE = '--source=';
const PROCESSOR_SERVICE = 'META-INF/services/javax.annotation.processing.Processor';
const MANIFEST = 'META-INF/MANIFEST.MF';
const LOMBOK_VERSION = /^Lombok-Version:\s*(\S+)\s*$/mu;
export const TESTED_LOMBOK = { lowest: '1.18.36', highest: '1.18.48' } as const;
const JDK_MODULE = /^--(?:add-exports|patch-module)=(?:java|jdk)\./u;
const PAIRED = ['--add-exports', '--patch-module'];

export function argumentSetOf(text: string): ArgumentSet {
  const lines = text.split('\n');
  const separator = lines.indexOf(SOURCES);
  return separator === -1
    ? { head: lines.filter((line) => line !== ''), sources: [] }
    : { head: lines.slice(0, separator), sources: lines.slice(separator + 1).filter(Boolean) };
}

function valuesAfter(head: readonly string[], prefix: string): string[] {
  return head.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length));
}

function entriesOf(value: string | undefined): string[] {
  return (value ?? '').split(path.delimiter).filter(Boolean);
}

function optionOf(head: readonly string[], flag: string): string | undefined {
  const at = head.indexOf(flag);
  return at === -1 ? undefined : head[at + 1];
}

export function encodingOf(head: readonly string[]): string | undefined {
  return optionOf(head, '-encoding');
}

export function projectFlags(head: readonly string[]): string[] {
  return valuesAfter(head, PROJECT_FLAG);
}

export function ownClasses(head: readonly string[]): string[] {
  return valuesAfter(head, OWN_CLASSES).flatMap(entriesOf);
}

export function lookupEntries(head: readonly string[]): string[] {
  return [...entriesOf(optionOf(head, '-classpath')), ...ownClasses(head)];
}

export function modulePathEntries(head: readonly string[]): string[] {
  return entriesOf(optionOf(head, '--module-path'));
}

export function generatedRoots(head: readonly string[]): string[] {
  return head.includes('--skip-generated') ? valuesAfter(head, GENERATED_ROOT) : [];
}

export function releaseOf(head: readonly string[]): string | undefined {
  const [release] = valuesAfter(head, RELEASE);
  const projectArguments = valuesAfter(head, PROJECT_ARG);
  const patchesJdk = projectArguments.some((argument, index) =>
    JDK_MODULE.test(
      PAIRED.includes(argument) ? `${argument}=${projectArguments[index + 1] ?? ''}` : argument,
    ),
  );
  return patchesJdk ? undefined : release;
}

/** The language level javac reads the sources at when no `--release` reaches the engine: `--release`, else `--source`. */
export function sourceLevelOf(head: readonly string[]): string | undefined {
  const [release] = valuesAfter(head, RELEASE);
  const [source] = valuesAfter(head, SOURCE);
  return release ?? source;
}

export function entryHolds(entry: string, name: string): boolean {
  if (!existsSync(entry)) {
    return false;
  }
  if (statSync(entry).isDirectory()) {
    const base = path.resolve(entry);
    const full = path.resolve(base, name);
    if (!full.startsWith(base + path.sep)) {
      return false;
    }
    return existsSync(full);
  }
  const read = readZipOrFailure(entry);
  return read.kind !== 'zip' || read.zip.names.has(name);
}

function declaresProcessor(entry: string): boolean {
  return entryHolds(entry, PROCESSOR_SERVICE);
}

export function runsProcessors(head: readonly string[]): boolean {
  return entriesOf(optionOf(head, '-processorpath')).some(declaresProcessor);
}

function lombokVersionIn(entry: string): string | undefined {
  if (!existsSync(entry) || statSync(entry).isDirectory()) {
    return undefined;
  }
  const read = readZipOrFailure(entry);
  const manifest = read.kind === 'zip' ? read.zip.text(MANIFEST) : undefined;
  return LOMBOK_VERSION.exec(manifest ?? '')?.[1];
}

export function lombokVersions(head: readonly string[]): string[] {
  return entriesOf(optionOf(head, '-processorpath')).flatMap(
    (entry) => lombokVersionIn(entry) ?? [],
  );
}

function versionParts(version: string): number[] {
  return version.split(/[.-]/u).map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left: string, right: string): number {
  const [a, b] = [versionParts(left), versionParts(right)];
  const width = Math.max(a.length, b.length);
  const at = Array.from({ length: width }, (_, index) => index).find(
    (index) => (a[index] ?? -1) !== (b[index] ?? -1),
  );
  return at === undefined ? 0 : (a[at] ?? -1) - (b[at] ?? -1);
}

export function lombokTested(version: string): boolean {
  return (
    compareVersions(version, TESTED_LOMBOK.lowest) >= 0 &&
    compareVersions(version, TESTED_LOMBOK.highest) <= 0
  );
}

function packagesIn(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && entry.name.endsWith('.class'))
    .filter((entry) => entry.parentPath !== root)
    .map((entry) => path.relative(root, entry.parentPath).split(path.sep).join('.'));
}

export function ownPackages(classDirectories: readonly string[]): string[] {
  const found = classDirectories
    .filter((root) => existsSync(root) && statSync(root).isDirectory())
    .flatMap(packagesIn);
  const sorted = [...new Set(found)].toSorted();
  return sorted.filter((name) => !sorted.some((other) => name.startsWith(`${other}.`)));
}

export function withProjectFlags(text: string, flags: readonly string[]): string {
  const lines = text.split('\n');
  const separator = lines.indexOf(SOURCES);
  const added = flags.map((flag) => `${PROJECT_FLAG}${flag}`);
  return [...lines.slice(0, separator), ...added, ...lines.slice(separator)].join('\n');
}
