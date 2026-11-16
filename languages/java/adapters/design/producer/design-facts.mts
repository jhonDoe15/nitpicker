import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isGeneratedJvm } from '../../generated/generated-sources.mjs';
import { compileDesignProgram, runDesignProgram } from './design-program.mts';
import { resolveInside } from '../../../../../shared/conventions/read-inside.mjs';
import { byText } from '../../../../../shared/text-order/by-text.mjs';
import { fieldOf, fieldsOf, listOf, numberOr } from '../../../../../shared/values/readers.mts';

export type DesignModule = {
  readonly dir: string;
  readonly sourceRoots: readonly string[];
  readonly published: boolean;
  readonly sourceJava?: unknown;
};
type SourceJava = { readonly java: string; readonly feature: number };
type ProgramInput = {
  readonly projectRoot: string;
  readonly files: readonly string[];
  readonly work: string;
  readonly target: string;
  readonly java: string | undefined;
};
type FactsRequest = {
  readonly projectRoot: string;
  readonly modules: readonly DesignModule[];
  readonly output?: string | undefined;
};

const SKIPPED_FILES = new Set(['module-info.java', 'package-info.java']);

function javaFilesUnder(projectRoot: string, root: string): string[] {
  const directory = resolveInside(projectRoot, root);
  if (directory === undefined || !existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .map((name) => name.replaceAll('\\', '/'))
    .filter((name) => name.endsWith('.java') && !SKIPPED_FILES.has(path.posix.basename(name)))
    .map((name) => `${root.replaceAll('\\', '/')}/${name}`);
}

export function designSourceFiles(projectRoot: string, modules: readonly DesignModule[]): string[] {
  const files = new Set(
    modules.flatMap((module) =>
      module.sourceRoots.flatMap((root) => javaFilesUnder(projectRoot, root)),
    ),
  );
  return [...files].filter((file) => !isGeneratedJvm(projectRoot, file)).toSorted(byText);
}

export function designPackages(
  modules: readonly DesignModule[],
): { readonly root: string; readonly published: boolean }[] {
  return modules.length < 2
    ? []
    : modules.map((module) => ({ root: module.dir, published: module.published }));
}

function publishedRoots(modules: readonly DesignModule[]): string[] {
  return modules
    .filter((module) => module.published)
    .flatMap((module) => module.sourceRoots.map((root) => `${root.replaceAll('\\', '/')}/`));
}

function isPublishedType(type: unknown, roots: readonly string[]): boolean {
  const file = fieldOf(type, 'file');
  return (
    fieldOf(type, 'exported') === true &&
    typeof file === 'string' &&
    roots.some((root) => file.startsWith(root))
  );
}

export function markPublished(
  types: readonly unknown[],
  modules: readonly DesignModule[],
): unknown[] {
  const roots = publishedRoots(modules);
  return types.map((type) =>
    isPublishedType(type, roots) ? { ...fieldsOf(type), published: true } : type,
  );
}

function sourceJavaOf(value: unknown): SourceJava | undefined {
  const java = fieldOf(value, 'java');
  return typeof java === 'string'
    ? { java, feature: numberOr(fieldOf(value, 'feature'), 0) }
    : undefined;
}

export function sourceJava(modules: readonly DesignModule[]): string | undefined {
  return modules
    .map((module) => sourceJavaOf(module.sourceJava))
    .filter((source) => source !== undefined)
    .filter(({ java }) => !path.isAbsolute(java) || existsSync(java))
    .reduce<SourceJava | undefined>(
      (best, source) => (best === undefined || source.feature > best.feature ? source : best),
      undefined,
    )?.java;
}

function programFacts({ projectRoot, files, work, target, java }: ProgramInput): unknown {
  if (files.length === 0) {
    return { modules: [], types: [], callables: [] };
  }
  const fileList = path.join(work, 'files.txt');
  writeFileSync(fileList, files.join('\n'));
  runDesignProgram({
    classes: compileDesignProgram(),
    projectRoot,
    fileList,
    output: target,
    java,
  });
  return JSON.parse(readFileSync(target, 'utf8'));
}

export function produceDesignFacts({
  projectRoot,
  modules,
  output,
}: FactsRequest): Readonly<Record<string, unknown>> {
  const files = designSourceFiles(projectRoot, modules);
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-'));
  try {
    const target = output ?? path.join(work, 'design-facts.json');
    mkdirSync(path.dirname(target), { recursive: true });
    rmSync(target, { force: true });
    const facts = programFacts({ projectRoot, files, work, target, java: sourceJava(modules) });
    const bundle = {
      ...fieldsOf(facts),
      types: markPublished(listOf(fieldOf(facts, 'types')), modules),
      packages: designPackages(modules),
    };
    writeFileSync(target, `${JSON.stringify(bundle)}\n`);
    return bundle;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
