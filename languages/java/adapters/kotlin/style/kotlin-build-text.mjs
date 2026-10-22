import { readInside } from '../../../../../shared/conventions/read-inside.mjs';
import { KOTLIN_INDENTATION } from '../../../conventions/kotlin-conventions.mjs';
import { mavenFormatters } from './kotlin-maven-text.mjs';

export const BUILD_FILES = [
  'build.gradle',
  'build.gradle.kts',
  'settings.gradle',
  'settings.gradle.kts',
  'gradle/libs.versions.toml',
];
export const POM = 'pom.xml';
const MAVEN = 'maven';
const EDITORCONFIG = '.editorconfig';
const SPOTLESS_SCRIPT_BLOCK = 'kotlinGradle';
const BRACE_DELTA = { '{': 1, '}': -1 };

function readIfExists(projectRoot, relative) {
  return readInside(projectRoot, relative, 'utf8') ?? '';
}

function withoutComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/(^|\s)\/\/.*$/gm, '$1');
}

function blockEnd(text, from) {
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

function withoutBlocks(text, name) {
  const opener = new RegExp(String.raw`\b${name}\s*\{`, 'g');
  const kept = [];
  let from = 0;
  for (const match of text.matchAll(opener)) {
    if (match.index >= from) {
      kept.push(text.slice(from, match.index));
      from = blockEnd(text, match.index + match[0].length);
    }
  }
  return [...kept, text.slice(from)].join('');
}

function gradleText(texts) {
  return withoutBlocks(withoutComments(texts.join('\n')), SPOTLESS_SCRIPT_BLOCK).toLowerCase();
}

export function kotlinFilesOf(projectRoot, effectivePom) {
  return {
    build: gradleText(BUILD_FILES.map((file) => readIfExists(projectRoot, file))),
    formatters: mavenFormatters(effectivePom),
    editorconfig: readIfExists(projectRoot, EDITORCONFIG),
  };
}

export function kotlinFilesFromSource(source) {
  const texts = source.readMany([...BUILD_FILES, EDITORCONFIG]);
  return {
    build: gradleText(BUILD_FILES.map((file) => texts.get(file) ?? '')),
    formatters: [],
    editorconfig: texts.get(EDITORCONFIG) ?? '',
  };
}

function names(formatters, formatter) {
  return formatters.some((declared) => declared.formatter === formatter);
}

export function detectFormatter({ build, formatters = [], editorconfig }) {
  if (build.includes('ktlint') || names(formatters, 'ktlint')) {
    return 'ktlint';
  }
  if (build.includes('ktfmt') || names(formatters, 'ktfmt')) {
    return 'ktfmt';
  }
  return editorconfig.includes('ktlint_') ? 'ktlint' : 'none';
}

const NAMED_KTFMT_STYLES = [
  ['kotlinlangstyle', 'kotlinlang'],
  ['dropboxstyle', 'kotlinlang'],
  ['googlestyle', 'google'],
  ['metastyle', 'meta'],
];
const CONVENTION_KTFMT_STYLES = { 2: 'meta', 4: 'kotlinlang' };

function namedStyle(build) {
  return NAMED_KTFMT_STYLES.find(([call]) => build.includes(call))?.[1];
}

export function declaredKtfmtStyle({ build, formatters = [] }) {
  return (
    namedStyle(build) ??
    formatters.find((declared) => declared.formatter === 'ktfmt' && declared.style)?.style
  );
}

export const KTFMT_STYLE_INDENTATION = { kotlinlang: '4', meta: '2', google: '2' };

export function ktfmtStyle({ declared, conventions }) {
  const followed = conventions[KOTLIN_INDENTATION];
  if (
    declared !== undefined &&
    (followed === undefined || KTFMT_STYLE_INDENTATION[declared] === followed)
  ) {
    return declared;
  }
  return CONVENTION_KTFMT_STYLES[followed] ?? 'meta';
}

export function mavenBuildFacts(files, configured) {
  const style = declaredKtfmtStyle(files);
  return {
    formatter: configured ?? detectFormatter(files),
    build: MAVEN,
    ...(style === undefined ? {} : { ktfmtStyle: style }),
  };
}

export function isMavenFacts(facts) {
  return facts?.build === MAVEN;
}
