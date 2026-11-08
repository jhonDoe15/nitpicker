import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  blankComments,
  blankLiterals,
  importsOf,
  packageOf,
  sourceFilesUnder,
} from '../../adapters/review-rules/java-sources.mjs';
import { javaClasses } from './java-members.mjs';
import { lombokConfig, lombokImports } from './lombok-members.mjs';

const NOT_MAIN = /(?:^|\/)src\/(?!main\/|\w+Main\/)[^/]+\/|^tests?\//u;
const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;
const TYPE_NAME = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/gu;
const KEYWORDS = new Set(['extends', 'super']);
const SINGLE_WRAPPERS = new Set(['Optional', 'AtomicReference', 'SoftReference', 'WeakReference']);
const MAX_SUPERCLASSES = 10;

function readFile(projectRoot, absolute) {
  const raw = blankComments(readFileSync(absolute, 'utf8'));
  const text = blankLiterals(raw);
  const file = path.relative(projectRoot, absolute).replaceAll('\\', '/');
  return {
    file,
    raw,
    packageName: packageOf(text),
    imports: importsOf(text),
    wildcards: [...text.matchAll(WILDCARD_IMPORT)].map(([, name]) => name),
    imported: lombokImports(text),
    classes: javaClasses(text),
  };
}

function qualifiedOf(source, klass) {
  return source.packageName === '' ? klass.name : `${source.packageName}.${klass.name}`;
}

export function readJavaProject(projectRoot) {
  const config = lombokConfig(projectRoot);
  const sources = sourceFilesUnder(projectRoot, ['.java'])
    .filter((absolute) => !NOT_MAIN.test(path.relative(projectRoot, absolute).replaceAll('\\', '/')))
    .map((absolute) => readFile(projectRoot, absolute))
    .map((source) => ({ ...source, config: config(source.file) }));
  const classes = new Map();
  for (const source of sources) {
    for (const klass of source.classes) {
      const qualified = qualifiedOf(source, klass);
      if (!classes.has(qualified)) {
        classes.set(qualified, { ...klass, qualified, source });
      }
    }
  }
  return { sources, classes };
}

function ownerChain(klass) {
  const chain = [];
  for (let current = klass; current !== undefined; current = current.owner) {
    chain.push(current);
  }
  return chain;
}

function baseCandidates(first, { source, klass }) {
  const prefix = source.packageName === '' ? '' : `${source.packageName}.`;
  const nested = ownerChain(klass).flatMap((owner) =>
    owner.simple === first ? [`${prefix}${owner.name}`] : [`${prefix}${owner.name}.${first}`],
  );
  const imported = source.imports.filter((entry) => entry.split('.').at(-1) === first);
  return [
    ...nested,
    ...imported,
    `${prefix}${first}`,
    ...source.wildcards.map((name) => `${name}.${first}`),
  ];
}

export function resolveClass(name, { project, source, klass }) {
  const parts = name.replaceAll(/\s+/gu, '').split('.');
  if (parts.length > 1 && project.classes.has(parts.join('.'))) {
    return parts.join('.');
  }
  const rest = parts.slice(1);
  return baseCandidates(parts[0], { source, klass })
    .map((base) => [base, ...rest].join('.'))
    .find((qualified) => project.classes.has(qualified));
}

export function typeReferences(type) {
  const references = [];
  const outer = [];
  let last;
  let index = 0;
  for (const match of type.matchAll(TYPE_NAME)) {
    for (const character of type.slice(index, match.index)) {
      if (character === '<') {
        outer.push(last);
      } else if (character === '>') {
        outer.pop();
      }
    }
    index = match.index + match[0].length;
    if (KEYWORDS.has(match[0])) {
      continue;
    }
    last = match[0].split('.').at(-1).trim();
    const wrapped = outer.length === 1 && SINGLE_WRAPPERS.has(outer[0]);
    const many = (outer.length > 0 && !wrapped) || (outer.length === 0 && type.endsWith(']'));
    references.push({ name: match[0], many });
  }
  return references;
}

export function fieldDeclaringClass(qualified, project) {
  let current = project.classes.get(qualified);
  for (let depth = 0; current !== undefined && depth < MAX_SUPERCLASSES; depth += 1) {
    if (current.fields.some((field) => !field.modifiers.includes('static'))) {
      return current;
    }
    const parent =
      current.extendsName === undefined
        ? undefined
        : resolveClass(current.extendsName, { project, source: current.source, klass: current });
    current = parent === undefined ? undefined : project.classes.get(parent);
  }
  return undefined;
}
