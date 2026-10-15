import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SCHEDULING = 'org.springframework.scheduling.annotation';
const CACHE = 'org.springframework.cache.annotation';
const SECURITY = 'org.springframework.security.access';
const FEATURES = [
  { enabler: ['EnableScheduling'], users: [`${SCHEDULING}.Scheduled`] },
  { enabler: ['EnableAsync'], users: [`${SCHEDULING}.Async`] },
  {
    enabler: ['EnableCaching'],
    users: ['Cacheable', 'CacheEvict', 'CachePut', 'Caching'].map((name) => `${CACHE}.${name}`),
  },
  {
    enabler: ['EnableMethodSecurity', 'EnableGlobalMethodSecurity', 'EnableReactiveMethodSecurity'],
    users: [
      ...['PreAuthorize', 'PostAuthorize', 'PreFilter', 'PostFilter'].map(
        (name) => `${SECURITY}.prepost.${name}`,
      ),
      `${SECURITY}.annotation.Secured`,
    ],
  },
  {
    enabler: ['EnableRetry', 'EnableResilientMethods'],
    users: [
      'org.springframework.retry.annotation.Retryable',
      'org.springframework.resilience.annotation.Retryable',
    ],
  },
];
const LITERALS_AND_COMMENTS =
  /"""(?:[^\\]|\\[\s\S])*?"""|"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

function blank(text) {
  return text.replaceAll(/[^\n]/g, ' ');
}

function codeOf(source) {
  return source.replaceAll(LITERALS_AND_COMMENTS, (token) =>
    token.startsWith('/') ? blank(token) : `${token[0]}${blank(token.slice(1, -1))}${token.at(-1)}`,
  );
}

function escaped(text) {
  return text.replaceAll('.', String.raw`\.`);
}

function javaFiles(directory) {
  return existsSync(directory)
    ? readdirSync(directory, { withFileTypes: true, recursive: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
        .map((entry) => path.join(entry.parentPath, entry.name))
        .sort()
    : [];
}

function enablerPattern(names) {
  return new RegExp(String.raw`@\s*(?:\w+\s*\.\s*)*(?:${names.join('|')})\b`);
}

function firstUse(code, qualified) {
  const separator = qualified.lastIndexOf('.');
  const owner = qualified.slice(0, separator);
  const simple = qualified.slice(separator + 1);
  const imported = new RegExp(String.raw`\bimport\s+${escaped(owner)}\.(?:${simple}|\*)\s*;`);
  const patterns = [new RegExp(String.raw`@\s*${escaped(qualified)}\b`)];
  if (imported.test(code)) {
    patterns.push(new RegExp(String.raw`@\s*${simple}\b`));
  }
  const offsets = patterns
    .map((pattern) => pattern.exec(code)?.index)
    .filter((offset) => offset !== undefined);
  return offsets.length === 0 ? undefined : { simple, offset: Math.min(...offsets) };
}

function lineOf(code, offset) {
  return code.slice(0, offset).split('\n').length;
}

function readSources(projectRoot, sourceRoots) {
  return sourceRoots
    .flatMap((root) => javaFiles(path.join(projectRoot, root)))
    .map((file) => ({
      path: path.relative(projectRoot, file).split(path.sep).join('/'),
      code: codeOf(readFileSync(file, 'utf8')),
    }));
}

export function springWiringProblems(projectRoot, sourceRoots) {
  const files = readSources(projectRoot, sourceRoots);
  return FEATURES.flatMap(({ enabler, users }) => {
    const pattern = enablerPattern(enabler);
    if (files.some(({ code }) => pattern.test(code))) {
      return [];
    }
    return files.flatMap(({ path: file, code }) => {
      const use = users
        .map((qualified) => firstUse(code, qualified))
        .filter((found) => found !== undefined)
        .sort((left, right) => left.offset - right.offset)[0];
      return use === undefined
        ? []
        : [
            {
              path: file,
              line: lineOf(code, use.offset),
              key: `enable-${enabler[0].slice('Enable'.length).toLowerCase()}`,
              message: `@${use.simple} does nothing: no class has @${enabler[0]}. Add @${enabler[0]} to one @Configuration class.`,
            },
          ];
    });
  });
}
