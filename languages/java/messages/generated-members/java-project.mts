import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  blankComments,
  blankLiterals,
  importsOf,
  packageOf,
  sourceFilesUnder,
} from '../../adapters/review-rules/java-sources.mts';
import { javaClasses } from './java-members.mts';
import { lombokConfig, lombokImports } from './lombok-members.mts';
import type { JavaClass, JavaProject, JavaSource, ProjectClass } from './member-types.mts';

type Reference = { name: string; many: boolean };
type SourceFile = Omit<JavaSource, 'config'>;
type ClassContext = { source: JavaSource; klass: JavaClass };

const NOT_MAIN = /(?:^|\/)src\/(?!main\/|\w+Main\/)[^/]+\/|^tests?\//u;
const WILDCARD_IMPORT = /^\s*import\s+([\w.]+)\.\*\s*;/gmu;
const TYPE_NAME = /[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/gu;
const KEYWORDS = new Set(['extends', 'super']);
const SINGLE_WRAPPERS = new Set(['Optional', 'AtomicReference', 'SoftReference', 'WeakReference']);
const OPAQUE_WRAPPERS = new Set([
  'Class',
  'Supplier',
  'Function',
  'BiFunction',
  'UnaryOperator',
  'BinaryOperator',
  'Predicate',
  'BiPredicate',
  'Consumer',
  'BiConsumer',
  'Callable',
  'Comparator',
  'ThreadLocal',
  'Future',
  'CompletableFuture',
  'CompletionStage',
  'Provider',
  'ObjectProvider',
  'Mono',
  'Flux',
  'Publisher',
  'Stream',
]);
const MAX_SUPERCLASSES = 10;

function readFile(projectRoot: string, absolute: string): SourceFile {
  const raw = blankComments(readFileSync(absolute, 'utf8'));
  const text = blankLiterals(raw);
  const file = path.relative(projectRoot, absolute).replaceAll('\\', '/');
  return {
    file,
    raw,
    packageName: packageOf(text),
    imports: importsOf(text),
    wildcards: [...text.matchAll(WILDCARD_IMPORT)].map(([, name = '']) => name),
    imported: lombokImports(text),
    classes: javaClasses(text),
  };
}

function qualifiedOf(source: SourceFile, klass: JavaClass): string {
  return source.packageName === '' ? klass.name : `${source.packageName}.${klass.name}`;
}

function classIndex(sources: JavaSource[]): Map<string, ProjectClass> {
  const entries = sources.flatMap((source) =>
    source.classes.map((klass): [string, ProjectClass] => {
      const qualified = qualifiedOf(source, klass);
      return [qualified, { ...klass, qualified, source }];
    }),
  );
  return new Map(entries.toReversed());
}

export function readJavaProject(projectRoot: string): JavaProject {
  const config = lombokConfig(projectRoot);
  const sources = sourceFilesUnder(projectRoot, ['.java'])
    .filter(
      (absolute) => !NOT_MAIN.test(path.relative(projectRoot, absolute).replaceAll('\\', '/')),
    )
    .map((absolute) => readFile(projectRoot, absolute))
    .map((source) => ({ ...source, config: config(source.file) }));
  return { sources, classes: classIndex(sources) };
}

function ownerChain(klass: JavaClass): JavaClass[] {
  const chain = [klass];
  for (const current of chain) {
    if (current.owner !== undefined) {
      chain.push(current.owner);
    }
  }
  return chain;
}

function baseCandidates(first: string, { source, klass }: ClassContext): string[] {
  const prefix = source.packageName === '' ? '' : `${source.packageName}.`;
  const nested = ownerChain(klass).flatMap((owner) =>
    owner.simple === first ? [`${prefix}${owner.name}`] : [`${prefix}${owner.name}.${first}`],
  );
  const imported = source.imports.filter((entry) => entry.split('.').at(-1) === first);
  if (imported.length > 0) {
    return [...nested, ...imported];
  }
  return [
    ...nested,
    ...imported,
    `${prefix}${first}`,
    ...source.wildcards.map((name) => `${name}.${first}`),
  ];
}

export function resolveClass(
  name: string,
  { project, source, klass }: ClassContext & { project: JavaProject },
): string | undefined {
  const parts = name.replaceAll(/\s+/gu, '').split('.');
  const first = parts[0] ?? '';
  if (ownerChain(klass).some((owner) => owner.typeParameters.includes(first))) {
    return undefined;
  }
  if (parts.length > 1 && project.classes.has(parts.join('.'))) {
    return parts.join('.');
  }
  const rest = parts.slice(1);
  return baseCandidates(first, { source, klass })
    .map((base) => [base, ...rest].join('.'))
    .find((qualified) => project.classes.has(qualified));
}

function genericDepths(type: string): Map<number, (string | undefined)[]> {
  const outer: (string | undefined)[] = [];
  const depths = new Map<number, (string | undefined)[]>();
  let last: string | undefined;
  for (const match of type.matchAll(/[<>]|[A-Za-z_$][\w$]*(?:\s*\.\s*[A-Za-z_$][\w$]*)*/gu)) {
    if (match[0] === '<') {
      outer.push(last);
    } else if (match[0] === '>') {
      outer.pop();
    } else {
      depths.set(match.index, [...outer]);
      last = (match[0].split('.').at(-1) ?? '').trim();
    }
  }
  return depths;
}

function isMany(outer: (string | undefined)[], type: string): boolean {
  if (outer.length === 0) {
    return type.endsWith(']');
  }
  return !(outer.length === 1 && SINGLE_WRAPPERS.has(outer[0] ?? ''));
}

export function typeReferences(type: string): Reference[] {
  const depths = genericDepths(type);
  return [...type.matchAll(TYPE_NAME)]
    .filter((match) => !KEYWORDS.has(match[0]))
    .filter(
      (match) => !(depths.get(match.index) ?? []).some((outer) => OPAQUE_WRAPPERS.has(outer ?? '')),
    )
    .map((match) => ({ name: match[0], many: isMany(depths.get(match.index) ?? [], type) }));
}

function superclassOf(klass: ProjectClass, project: JavaProject): ProjectClass | undefined {
  if (klass.extendsName === undefined) {
    return undefined;
  }
  const parent = resolveClass(klass.extendsName, { project, source: klass.source, klass });
  return parent === undefined ? undefined : project.classes.get(parent);
}

export function fieldDeclaringClass(
  qualified: string,
  project: JavaProject,
): ProjectClass | undefined {
  const chain = [project.classes.get(qualified)].filter((klass) => klass !== undefined);
  for (const klass of chain) {
    if (klass.fields.some((field) => !field.modifiers.includes('static'))) {
      return klass;
    }
    const parent = superclassOf(klass, project);
    if (parent !== undefined && !chain.includes(parent) && chain.length < MAX_SUPERCLASSES) {
      chain.push(parent);
    }
  }
  return undefined;
}
