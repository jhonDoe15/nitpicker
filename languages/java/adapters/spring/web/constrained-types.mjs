import path from 'node:path';
import {
  blankLiterals,
  packageOf,
  pathInside,
  sourceFilesUnder,
  withoutGenerics,
} from '../../review-rules/java-sources.mjs';
import {
  BODY_STATUS,
  CONSTRAINT_TYPES,
} from '../../kotlin/review-rules/validation/constraint-names.mjs';
import { javaResolver, topLevel, typeDeclarations } from '../proxies/java-declarations.mjs';
import { cascadedTypeTexts } from './cascades.mjs';

const LISTED_CONSTRAINTS = new Set(CONSTRAINT_TYPES);
const CONSTRAINT_PACKAGE =
  /^(?:(?:jakarta|javax)\.validation\.constraints|org\.hibernate\.validator\.constraints(?:\.\w+)*)\.\w+$/u;
const CONSTRAINT_META = new Set(['jakarta.validation.Constraint', 'javax.validation.Constraint']);
const ANNOTATION = /@\s*([A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*)/gu;
const TYPE_NAME = /[A-Za-z_$][\w$.]*/gu;
const SUPERTYPES = /\b(?:extends|implements)\s+([^{]*)/u;
const PERMITS = /\bpermits\b[\s\S]*/u;
const ABSTRACT_PREFIX = /\b(?:abstract|sealed)\b[^;{}]*$/u;
const JDK_PACKAGE = /^javax?\.(?!validation\.)/u;
const PREFIX_WINDOW = 300;
const JDK_TYPES = new Set(
  'String Object Integer Long Short Byte Double Float Boolean Character Number Comparable Iterable Enum Record CharSequence List Set Map Collection Optional Mono Flux ResponseEntity HttpEntity'.split(
    ' ',
  ),
);

export function typeIndex({ projectRoot, roots, readText }) {
  return { projectRoot, roots, readText, files: undefined, sources: new Map(), customs: new Map() };
}

function listFiles({ projectRoot, roots }) {
  const files = new Map();
  const listed = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), ['.java']),
  );
  for (const file of listed) {
    const base = path.basename(file, '.java');
    files.set(base, [...(files.get(base) ?? []), file]);
  }
  return files;
}

function filesNamed(index, name) {
  index.files ??= listFiles(index);
  return index.files.get(name) ?? [];
}

export function sourceOf(index, file) {
  if (!index.sources.has(file)) {
    const raw = index.readText(path.relative(index.projectRoot, file));
    const text = raw === undefined ? undefined : blankLiterals(raw);
    const types = text === undefined ? [] : typeDeclarations(text, packageOf(text));
    index.sources.set(
      file,
      text === undefined
        ? undefined
        : { text, types, resolve: javaResolver(text, packageOf(text), types) },
    );
  }
  return index.sources.get(file);
}

function find(index, qualified) {
  const top = qualified.split('$')[0].split('.').at(-1);
  return filesNamed(index, top)
    .map((file) => ({ file, source: sourceOf(index, file) }))
    .flatMap(({ source }) => {
      const type = source?.types.find((declared) => declared.qualified === qualified);
      return type === undefined ? [] : [{ source, type }];
    })
    .at(0);
}

function isCustom(index, candidate) {
  if (!index.customs.has(candidate)) {
    index.customs.set(candidate, false);
    const found = find(index, candidate);
    const custom =
      found?.type.annotations.some((name) =>
        found.source.resolve(name).some((qualified) => CONSTRAINT_META.has(qualified)),
      ) ?? false;
    index.customs.set(candidate, custom);
  }
  return index.customs.get(candidate);
}

function isConstraint(index, candidates) {
  const exact = candidates.length === 1;
  return (
    candidates.some((candidate) => LISTED_CONSTRAINTS.has(candidate)) ||
    (exact && CONSTRAINT_PACKAGE.test(candidates[0])) ||
    candidates.some((candidate) => isCustom(index, candidate))
  );
}

function declaresConstraint(index, { source, type }, region) {
  const names = new Set([
    ...type.annotations,
    ...[...region.matchAll(ANNOTATION)].map((match) => match[1].replaceAll(/\s/gu, '')),
  ]);
  return [...names].some((name) => isConstraint(index, source.resolve(name)));
}

function superNames(text, type) {
  const header = topLevel(text.slice(type.index, type.open < 0 ? type.index : type.open));
  const listed = SUPERTYPES.exec(header)?.[1];
  return listed === undefined
    ? []
    : withoutGenerics(listed.replace(PERMITS, ''))
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
}

function namesIn(text) {
  return text.match(TYPE_NAME) ?? [];
}

function isAbstractLike(text, type) {
  const before = text.slice(Math.max(0, type.index - PREFIX_WINDOW), type.index);
  const prefix = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
  return text.startsWith('interface', type.index) || ABSTRACT_PREFIX.test(prefix);
}

function isUnseen(name, candidates) {
  const jdk = candidates.length === 1 && JDK_PACKAGE.test(candidates[0]);
  return !(JDK_TYPES.has(name.split('.').at(-1)) || jdk);
}

function relatedNames(source, type) {
  const region = source.text.slice(type.index, type.close < 0 ? type.index : type.close + 1);
  return {
    region,
    names: [
      ...superNames(source.text, type),
      ...cascadedTypeTexts(region).flatMap((text) => namesIn(text)),
    ],
  };
}

function step(index, item, seen) {
  const candidates = item.source.resolve(item.name);
  const found = candidates.map((candidate) => find(index, candidate)).find(Boolean);
  if (found === undefined) {
    return { unresolved: isUnseen(item.name, candidates), next: [] };
  }
  if (seen.has(found.type.qualified)) {
    return { next: [] };
  }
  seen.add(found.type.qualified);
  const { region, names } = relatedNames(found.source, found.type);
  return {
    constrained: declaresConstraint(index, found, region),
    unresolved: item.root && isAbstractLike(found.source.text, found.type),
    next: names.map((name) => ({ source: found.source, name, root: false })),
  };
}

export function bodyStatus(index, source, typeText) {
  const queue = namesIn(typeText)
    .filter((name) => /^\p{Lu}/u.test(name.split('.').at(-1)))
    .map((name) => ({ source, name, root: true }));
  const seen = new Set();
  let unresolved = false;
  for (const item of queue) {
    const result = step(index, item, seen);
    if (result.constrained) {
      return BODY_STATUS.constrained;
    }
    unresolved ||= result.unresolved === true;
    queue.push(...result.next);
  }
  return unresolved ? BODY_STATUS.unresolved : BODY_STATUS.unconstrained;
}
