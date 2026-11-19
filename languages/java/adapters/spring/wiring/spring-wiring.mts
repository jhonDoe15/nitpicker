import { readFileSync } from 'node:fs';
import path from 'node:path';
import { blankLiterals } from '../../review-rules/java-sources.mts';
import type { SpringProblem } from '../typed/spring-types.mts';
import type { AnnotationUse, Feature, WiringCode, WiringSource } from './wiring-types.mts';
import { escapeRegExp, projectFilesUnder } from '../typed/shared-views.mts';

const SCHEDULING = 'org.springframework.scheduling.annotation';
const CACHE = 'org.springframework.cache.annotation';
const SECURITY = 'org.springframework.security.access';
const FEATURES: Feature[] = [
  {
    enabler: ['EnableScheduling'],
    xml: /<task:annotation-driven\b/,
    users: [`${SCHEDULING}.Scheduled`],
  },
  { enabler: ['EnableAsync'], xml: /<task:annotation-driven\b/, users: [`${SCHEDULING}.Async`] },
  {
    enabler: ['EnableCaching'],
    xml: /<cache:annotation-driven\b/,
    users: ['Cacheable', 'CacheEvict', 'CachePut', 'Caching'].map((name) => `${CACHE}.${name}`),
  },
  {
    enabler: ['EnableMethodSecurity', 'EnableGlobalMethodSecurity', 'EnableReactiveMethodSecurity'],
    xml: /<(?:security:)?(?:global-)?method-security\b/,
    users: [
      ...['PreAuthorize', 'PostAuthorize', 'PreFilter', 'PostFilter'].map(
        (name) => `${SECURITY}.prepost.${name}`,
      ),
      `${SECURITY}.annotation.Secured`,
    ],
  },
  {
    enabler: ['EnableRetry', 'EnableResilientMethods'],
    xml: /<retry:annotation-driven\b/,
    users: [
      'org.springframework.retry.annotation.Retryable',
      'org.springframework.resilience.annotation.Retryable',
    ],
  },
];
const SOURCE_FILE = /\.(?:java|kt)$/;

function filesIn(directory: string, pattern: RegExp): string[] {
  return projectFilesUnder(directory)
    .filter((file) => pattern.test(path.basename(file)))
    .sort();
}

function enablerPattern(names: readonly string[]): RegExp {
  return new RegExp(String.raw`@\s*(?:\w+\s*\.\s*)*(?:${names.map(escapeRegExp).join('|')})\b`);
}

function uses(code: string, qualified: string): AnnotationUse[] {
  const separator = qualified.lastIndexOf('.');
  const owner = qualified.slice(0, separator);
  const simple = qualified.slice(separator + 1);
  const imported = new RegExp(
    String.raw`\bimport\s+${escapeRegExp(owner)}\.(?:${escapeRegExp(simple)}\b|\*)`,
  );
  const names = imported.test(code) ? [qualified, simple] : [qualified];
  const pattern = new RegExp(String.raw`@\s*(?:${names.map(escapeRegExp).join('|')})\b`, 'g');
  return [...code.matchAll(pattern)].map((match) => ({ simple, offset: match.index }));
}

export function lineOf(code: string, offset: number): number {
  return code.slice(0, offset).split('\n').length;
}

function readSources(
  projectRoot: string,
  roots: readonly string[],
  pattern: RegExp,
): WiringSource[] {
  return roots
    .flatMap((root) => filesIn(path.join(projectRoot, root), pattern))
    .map((file) => ({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      text: readFileSync(file, 'utf8'),
    }));
}

function enabled(
  feature: Feature,
  files: readonly WiringCode[],
  xmlFiles: readonly WiringSource[],
): boolean {
  const pattern = enablerPattern(feature.enabler);
  return (
    files.some(({ code }) => pattern.test(code)) ||
    xmlFiles.some(({ text }) => feature.xml.test(text))
  );
}

export function springWiringProblems(
  projectRoot: string,
  sourceRoots: readonly string[],
  resourceRoots: readonly string[] = [],
): SpringProblem[] {
  const files = readSources(projectRoot, sourceRoots, SOURCE_FILE).map(({ path: file, text }) => ({
    path: file,
    code: blankLiterals(text),
  }));
  const xmlFiles = readSources(projectRoot, [...sourceRoots, ...resourceRoots], /\.xml$/);
  return FEATURES.filter((feature) => !enabled(feature, files, xmlFiles)).flatMap(
    ({ enabler, users }) =>
      files.flatMap(({ path: file, code }) =>
        users
          .flatMap((qualified) => uses(code, qualified))
          .sort((left, right) => left.offset - right.offset)
          .map((use) => ({
            path: file,
            line: lineOf(code, use.offset),
            key: `enable-${(enabler[0] ?? '').slice('Enable'.length).toLowerCase()}`,
            message: `Add @${enabler[0] ?? ''} to one @Configuration class; without it @${use.simple} does nothing.`,
          })),
      ),
  );
}
