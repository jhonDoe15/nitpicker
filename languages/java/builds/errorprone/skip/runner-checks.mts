import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import CHECKS from '../../../gradle/errorprone/checks.json' with { type: 'json' };
import { zipEntryOf } from '../../../../../shared/archives/zip-entry.mts';
import {
  ancestorDirectories,
  isFile,
  readTextIfExists,
} from '../../../../../shared/filesystem.mts';
import { entryHolds, projectFlags } from '../engine-arguments.mts';

const OFF = new Set([...CHECKS.defaultOff, ...CHECKS.disable]);
export const ENABLED_CHECKS: readonly string[] = CHECKS.reviewedChecks.filter(
  (check) => !OFF.has(check),
);
export const LOMBOK_UNSUPPRESSED_OFF: readonly string[] = CHECKS.lombokUnsuppressedOff;
export const CANNOT_BE_OFF: readonly string[] = ['UnicodeDirectionalityCharacters'];
export const IMMUTABLE = 'Immutable';

const ADD_SUPPRESS_WARNINGS = /^\s*lombok\.addSuppressWarnings\s*=\s*(\w+)/mu;
const STOP_BUBBLING = /^\s*config\.stopBubbling\s*=\s*true\b/mu;
const IMMUTABLE_CLASS = 'com/google/errorprone/annotations/Immutable.class';
const IMMUTABLE_USE = /@(?:[\w.]+\.)?Immutable\b|annotations\.Immutable\b/u;
const CHECKER_SERVICE = 'META-INF/services/com.google.errorprone.bugpatterns.BugChecker';
const NULL_AWAY_CHECKERS: ReadonlySet<string> = new Set([
  'com.uber.nullaway.NullAway',
  'com.uber.nullaway.JSpecifyUnrecognizedAnnotationLocation',
  'com.uber.nullaway.RequireExplicitNullMarking',
]);
const CHECK_LEVEL = /^-Xep:(\w+)(?::(\w+))?$/u;

function unsuppressedIn(directory: string): boolean {
  for (const current of ancestorDirectories(directory)) {
    const config = path.join(current, 'lombok.config');
    const text = isFile(config) ? readFileSync(config, 'utf8') : '';
    const setting = ADD_SUPPRESS_WARNINGS.exec(text);
    if (setting !== null || STOP_BUBBLING.test(text)) {
      return setting?.[1]?.toLowerCase() === 'false';
    }
  }
  return false;
}

/** The sources under a `lombok.config` that sets `lombok.addSuppressWarnings = false`, as the runner groups them. */
export function lombokUnsuppressed(sources: readonly string[]): ReadonlySet<string> {
  const directories = new Map<string, boolean>();
  return new Set(
    sources.filter((source) => {
      const directory = path.dirname(path.resolve(source));
      const known = directories.get(directory) ?? unsuppressedIn(directory);
      directories.set(directory, known);
      return known;
    }),
  );
}

function optionEntries(head: readonly string[], flag: string): string[] {
  const at = head.indexOf(flag);
  return at === -1 ? [] : (head[at + 1] ?? '').split(path.delimiter).filter(Boolean);
}

/** Whether the runner leaves Immutable on: its annotation is on the class or module path, or a source names it. */
export function immutableInReach(head: readonly string[], sources: readonly string[]): boolean {
  const entries = [...optionEntries(head, '-classpath'), ...optionEntries(head, '--module-path')];
  return (
    entries.some((entry) => entryHolds(entry, IMMUTABLE_CLASS)) ||
    sources.some((source) => IMMUTABLE_USE.test(readFileSync(source, 'latin1')))
  );
}

function checkersIn(entry: string): string[] {
  if (!existsSync(entry)) {
    return [];
  }
  const text = statSync(entry).isDirectory()
    ? readTextIfExists(path.join(entry, CHECKER_SERVICE))
    : (zipEntryOf(entry, CHECKER_SERVICE) ?? '');
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/u, '').trim())
    .filter(Boolean);
}

/** Whether the processor path brings checks besides NullAway's, which Error Prone runs as plugins. */
export function hasCheckPlugins(head: readonly string[]): boolean {
  return optionEntries(head, '-processorpath').some((entry) =>
    checkersIn(entry).some((checker) => !NULL_AWAY_CHECKERS.has(checker)),
  );
}

/** The checks the project's `-Xep:<Check>[:<level>]` flags turn on and those they turn off. */
export function projectLevels(head: readonly string[]): {
  readonly on: ReadonlySet<string>;
  readonly off: ReadonlySet<string>;
} {
  const levels = new Map<string, boolean>();
  for (const flag of projectFlags(head)) {
    const [, check, level] = CHECK_LEVEL.exec(flag) ?? [];
    if (check !== undefined) {
      levels.set(check, level !== 'OFF');
    }
  }
  const named = [...levels];
  return {
    on: new Set(named.filter(([, on]) => on).map(([check]) => check)),
    off: new Set(named.filter(([, on]) => !on).map(([check]) => check)),
  };
}
