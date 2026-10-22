import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { blankLiterals } from '../../review-rules/java-sources.mjs';

const SCHEDULING = 'org.springframework.scheduling.annotation';
const CACHE = 'org.springframework.cache.annotation';
const SECURITY = 'org.springframework.security.access';
const FEATURES = [
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

function escaped(text) {
  return text.replaceAll('.', String.raw`\.`);
}

function filesIn(directory, pattern) {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && pattern.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : [];
}

function enablerPattern(names) {
  return new RegExp(String.raw`@\s*(?:\w+\s*\.\s*)*(?:${names.join('|')})\b`);
}

function uses(code, qualified) {
  const separator = qualified.lastIndexOf('.');
  const owner = qualified.slice(0, separator);
  const simple = qualified.slice(separator + 1);
  const imported = new RegExp(String.raw`\bimport\s+${escaped(owner)}\.(?:${simple}\b|\*)`);
  const names = imported.test(code) ? [escaped(qualified), simple] : [escaped(qualified)];
  const pattern = new RegExp(String.raw`@\s*(?:${names.join('|')})\b`, 'g');
  return [...code.matchAll(pattern)].map((match) => ({ simple, offset: match.index }));
}

function lineOf(code, offset) {
  return code.slice(0, offset).split('\n').length;
}

function readSources(projectRoot, roots, pattern) {
  return roots
    .flatMap((root) => filesIn(path.join(projectRoot, root), pattern))
    .map((file) => ({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      text: readFileSync(file, 'utf8'),
    }));
}

function enabled(feature, files, xmlFiles) {
  const pattern = enablerPattern(feature.enabler);
  return (
    files.some(({ code }) => pattern.test(code)) ||
    xmlFiles.some(({ text }) => feature.xml.test(text))
  );
}

export function springWiringProblems(projectRoot, sourceRoots, resourceRoots = []) {
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
            key: `enable-${enabler[0].slice('Enable'.length).toLowerCase()}`,
            message: `@${use.simple} does nothing: no class has @${enabler[0]}. Add @${enabler[0]} to one @Configuration class.`,
          })),
      ),
  );
}
