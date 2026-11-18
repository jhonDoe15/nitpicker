import { escapeRegExp } from '../scan/typed/typed-scan.mts';
import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { callUntyped } from '../../../../../shared/values/boundaries/untyped-call.mts';
import { fieldOf, optionalText } from '../../../../../shared/values/readers.mts';
import type { ConventionSource } from '../../../../../core/conventions/typed/convention-types.mts';
import type { Conventions } from './kotlin-style-files.mts';
import { KOTLIN_INDENTATION } from '../../../conventions/kotlin-conventions.mts';
import { type Formatter, mavenFormatters } from './kotlin-maven-text.mts';

type KotlinFiles = { build: string; formatters: Formatter[]; editorconfig: string };
type FormatterInput = { build: string; formatters?: Formatter[]; editorconfig: string };
type MavenFacts = { formatter: string; build: string; ktfmtStyle?: string };

export const BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle/libs.versions.toml',
];
const KTLINT = 'ktlint';
const KTFMT = 'ktfmt';
const KOTLINLANG = 'kotlinlang';
const MAVEN = 'maven';
const EDITORCONFIG = '.editorconfig';
const SPOTLESS_SCRIPT_BLOCK = 'kotlinGradle';
const BRACE_DELTA: Readonly<Record<string, number>> = { '{': 1, '}': -1 };

function readIfExists(projectRoot: string, relative: string): string {
  return optionalText(callUntyped(readInside, projectRoot, relative, 'utf8')) ?? '';
}

function withoutComments(text: string): string {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

function blockEnd(text: string, from: number): number {
  let depth = 1;
  let index = from;
  for (const character of text.slice(from)) {
    index += 1;
    depth += BRACE_DELTA[character] ?? 0;
    if (depth === 0) {
      return index;
    }
  }
  return index;
}

function withoutBlocks(text: string, name: string): string {
  const opener = new RegExp(String.raw`\b${escapeRegExp(name)}\s*\{`, 'g');
  const kept: string[] = [];
  let from = 0;
  for (const match of text.matchAll(opener)) {
    if (match.index >= from) {
      kept.push(text.slice(from, match.index));
      from = blockEnd(text, match.index + match[0].length);
    }
  }
  return [...kept, text.slice(from)].join('');
}

function gradleText(texts: string[]): string {
  return withoutBlocks(withoutComments(texts.join('\n')), SPOTLESS_SCRIPT_BLOCK).toLowerCase();
}

export function kotlinFilesOf(projectRoot: string, effectivePom: string | undefined): KotlinFiles {
  return {
    build: gradleText(BUILD_FILES.map((file) => readIfExists(projectRoot, file))),
    formatters: mavenFormatters(effectivePom),
    editorconfig: readIfExists(projectRoot, EDITORCONFIG),
  };
}

export function kotlinFilesFromSource(source: ConventionSource): KotlinFiles {
  const texts = source.readMany([...BUILD_FILES, EDITORCONFIG]);
  return {
    build: gradleText(BUILD_FILES.map((file) => texts.get(file) ?? '')),
    formatters: [],
    editorconfig: texts.get(EDITORCONFIG) ?? '',
  };
}

function names(formatters: Formatter[], formatter: string): boolean {
  return formatters.some((declared) => declared.formatter === formatter);
}

export function detectFormatter({
  build,
  formatters = [],
  editorconfig,
}: FormatterInput): typeof KTLINT | typeof KTFMT | 'none' {
  if (build.includes(KTLINT) || names(formatters, KTLINT)) {
    return KTLINT;
  }
  if (build.includes(KTFMT) || names(formatters, KTFMT)) {
    return KTFMT;
  }
  return editorconfig.includes('ktlint_') ? KTLINT : 'none';
}

const NAMED_KTFMT_STYLES: readonly (readonly [string, string])[] = [
  ['kotlinlangstyle', KOTLINLANG],
  ['dropboxstyle', KOTLINLANG],
  ['googlestyle', 'google'],
  ['metastyle', 'meta'],
];
const CONVENTION_KTFMT_STYLES: Readonly<Record<string, string>> = { 2: 'meta', 4: KOTLINLANG };

function namedStyle(build: string): string | undefined {
  return NAMED_KTFMT_STYLES.find(([call]) => build.includes(call))?.[1];
}

export function declaredKtfmtStyle({
  build,
  formatters = [],
}: Pick<FormatterInput, 'build' | 'formatters'>): string | undefined {
  return (
    namedStyle(build) ??
    formatters.find((declared) => declared.formatter === KTFMT && declared.style !== undefined)
      ?.style
  );
}

export const KTFMT_STYLE_INDENTATION: Readonly<Record<string, string>> = {
  kotlinlang: '4',
  meta: '2',
  google: '2',
};

export function ktfmtStyle({
  declared,
  conventions,
}: {
  declared: string | undefined;
  conventions: Conventions;
}): string {
  const followed = conventions[KOTLIN_INDENTATION];
  if (
    declared !== undefined &&
    (followed === undefined || KTFMT_STYLE_INDENTATION[declared] === followed)
  ) {
    return declared;
  }
  return CONVENTION_KTFMT_STYLES[followed ?? ''] ?? 'meta';
}

export function mavenBuildFacts(files: FormatterInput, configured: string | undefined): MavenFacts {
  const style = declaredKtfmtStyle(files);
  return {
    formatter: configured ?? detectFormatter(files),
    build: MAVEN,
    ...(style === undefined ? {} : { ktfmtStyle: style }),
  };
}

export function isMavenFacts(facts: unknown): boolean {
  return fieldOf(facts, 'build') === MAVEN;
}
