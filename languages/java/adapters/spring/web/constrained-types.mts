import path from 'node:path';
import {
  blankLiterals,
  packageOf,
  pathInside,
  sourceFilesUnder,
  withoutGenerics,
} from '../../review-rules/java-sources.mts';
import {
  BODY_STATUS,
  CONSTRAINT_TYPES,
} from '../../kotlin/review-rules/validation/constraint-names.mts';
import { javaResolver, topLevel, typeDeclarations } from '../proxies/java-declarations.mts';
import { cascadedTypeTexts } from './cascades.mts';
import type { TypeDeclaration } from '../proxies/declaration-types.mts';
import type {
  ConstrainedSource,
  FoundType,
  QueueItem,
  RelatedNames,
  StepResult,
  TypeIndex,
  TypeIndexInput,
} from './web-types.mts';

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

export function typeIndex({ projectRoot, roots, readText }: TypeIndexInput): TypeIndex {
  return { projectRoot, roots, readText, files: undefined, sources: new Map(), customs: new Map() };
}

function listFiles({ projectRoot, roots }: TypeIndexInput): Map<string, string[]> {
  const files = new Map<string, string[]>();
  const listed = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), ['.java']),
  );
  for (const file of listed) {
    const base = path.basename(file, '.java');
    files.set(base, [...(files.get(base) ?? []), file]);
  }
  return files;
}

function filesNamed(index: TypeIndex, name: string): string[] {
  index.files ??= listFiles(index);
  return index.files.get(name) ?? [];
}

export function sourceOf(index: TypeIndex, file: string): ConstrainedSource | undefined {
  const { sources } = index;
  if (!sources.has(file)) {
    const raw = index.readText(path.relative(index.projectRoot, file));
    const text = raw === undefined ? undefined : blankLiterals(raw);
    const types = text === undefined ? [] : typeDeclarations(text, packageOf(text));
    sources.set(
      file,
      text === undefined
        ? undefined
        : { text, types, resolve: javaResolver(text, packageOf(text), types) },
    );
  }
  return sources.get(file);
}

function find(index: TypeIndex, qualified: string): FoundType | undefined {
  const top = (qualified.split('$')[0] ?? '').split('.').at(-1) ?? '';
  return filesNamed(index, top)
    .map((file) => ({ file, source: sourceOf(index, file) }))
    .flatMap(({ source }) => {
      const type = source?.types.find((declared) => declared.qualified === qualified);
      return source === undefined || type === undefined ? [] : [{ source, type }];
    })
    .at(0);
}

function isCustom(index: TypeIndex, candidate: string): boolean {
  const known = index.customs.get(candidate);
  if (known !== undefined) {
    return known;
  }
  index.customs.set(candidate, false);
  const found = find(index, candidate);
  const custom =
    found?.type.annotations.some((name) =>
      found.source.resolve(name).some((qualified) => CONSTRAINT_META.has(qualified)),
    ) ?? false;
  index.customs.set(candidate, custom);
  return custom;
}

function isConstraint(index: TypeIndex, candidates: readonly string[]): boolean {
  const exact = candidates.length === 1;
  return (
    candidates.some((candidate) => LISTED_CONSTRAINTS.has(candidate)) ||
    (exact && CONSTRAINT_PACKAGE.test(candidates[0] ?? '')) ||
    candidates.some((candidate) => isCustom(index, candidate))
  );
}

function declaresConstraint(
  index: TypeIndex,
  { source, type }: FoundType,
  region: string,
): boolean {
  const names = new Set([
    ...type.annotations,
    ...[...region.matchAll(ANNOTATION)].map((match) => (match[1] ?? '').replaceAll(/\s/gu, '')),
  ]);
  return [...names].some((name) => isConstraint(index, source.resolve(name)));
}

function superNames(text: string, type: TypeDeclaration): string[] {
  const header = topLevel(text.slice(type.index, type.open < 0 ? type.index : type.open));
  const listed = SUPERTYPES.exec(header)?.[1];
  return listed === undefined
    ? []
    : withoutGenerics(listed.replace(PERMITS, ''))
        .split(',')
        .map((name) => name.trim())
        .filter((name) => name !== '');
}

function namesIn(text: string): string[] {
  return text.match(TYPE_NAME) ?? [];
}

function isAbstractLike(text: string, type: TypeDeclaration): boolean {
  const before = text.slice(Math.max(0, type.index - PREFIX_WINDOW), type.index);
  const prefix = before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}')) + 1);
  return text.startsWith('interface', type.index) || ABSTRACT_PREFIX.test(prefix);
}

function isUnseen(name: string, candidates: readonly string[]): boolean {
  const jdk = candidates.length === 1 && JDK_PACKAGE.test(candidates[0] ?? '');
  return !(JDK_TYPES.has(name.split('.').at(-1) ?? '') || jdk);
}

function relatedNames(source: ConstrainedSource, type: TypeDeclaration): RelatedNames {
  const region = source.text.slice(type.index, type.close < 0 ? type.index : type.close + 1);
  return {
    region,
    names: [
      ...superNames(source.text, type),
      ...cascadedTypeTexts(region).flatMap((text) => namesIn(text)),
    ],
  };
}

function step(index: TypeIndex, item: QueueItem, seen: Set<string>): StepResult {
  const candidates = item.source.resolve(item.name);
  const found = candidates
    .map((candidate) => find(index, candidate))
    .find((candidate): candidate is FoundType => candidate !== undefined);
  if (found === undefined) {
    return { constrained: false, unresolved: isUnseen(item.name, candidates), next: [] };
  }
  if (seen.has(found.type.qualified)) {
    return { constrained: false, unresolved: false, next: [] };
  }
  seen.add(found.type.qualified);
  const { region, names } = relatedNames(found.source, found.type);
  return {
    constrained: declaresConstraint(index, found, region),
    unresolved: item.root && isAbstractLike(found.source.text, found.type),
    next: names.map((name) => ({ source: found.source, name, root: false })),
  };
}

export function bodyStatus(index: TypeIndex, source: ConstrainedSource, typeText: string): string {
  const queue = namesIn(typeText)
    .filter((name) => /^\p{Lu}/u.test(name.split('.').at(-1) ?? ''))
    .map((name): QueueItem => ({ source, name, root: true }));
  const seen = new Set<string>();
  let unresolved = false;
  for (const item of queue) {
    const result = step(index, item, seen);
    if (result.constrained) {
      return BODY_STATUS.constrained;
    }
    unresolved ||= result.unresolved;
    for (const next of result.next) {
      queue.push(next);
    }
  }
  return unresolved ? BODY_STATUS.unresolved : BODY_STATUS.unconstrained;
}
