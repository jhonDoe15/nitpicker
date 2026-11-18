import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globMatcher } from '../../../../shared/paths/glob.mjs';
import { projectFilesUnder } from '../../../../shared/project-files/project-files.mjs';
import type {
  DepthChanges,
  SourceListing,
  SourceLocation,
  SourceProject,
  StaticImport,
} from './review-types.mts';

type DirectoryEntry = { readonly name: string };

const listFiles: (
  root: string,
  options: {
    readonly includeIgnored: boolean;
    readonly skipDirectory: (directory: string, entry: DirectoryEntry) => boolean;
  },
) => string[] = projectFilesUnder;
const matcherOf: (glob: string) => { test: (file: string) => boolean } = globMatcher;

const JAVA_EXTENSION = '.java';
const SKIPPED_DIRECTORIES = new Set(['.git', '.gradle', 'build', 'node_modules', 'out', 'target']);
const LITERALS = new RegExp(
  [
    String.raw`"""[\s\S]*?"""`,
    String.raw`\/\/[^\n]*`,
    String.raw`\/\*[\s\S]*?\*\/`,
    String.raw`"(?:\\.|[^"\\\n])*"`,
    String.raw`'(?:\\.|[^'\\\n])*'`,
  ].join('|'),
  'gu',
);
const PACKAGE = /^\s*package\s+([\w.]+)\s*(?:;|$)/mu;
const IMPORT = /^\s*import\s+([\w.]+)\s*;/gmu;
const STATIC_IMPORT = /^\s*import\s+static\s+([\w.]+?)(\.\*)?\s*;/gmu;
const DEPTH_CHANGE: DepthChanges = { '(': 1, '[': 1, ')': -1, ']': -1 };
const EXPRESSION_END = ';,?:{}';
const OUTSIDE_SOURCES = /^\.\.(?:\/|$)|(?:^|\/)build(?:\/|$)/u;
const NOTHING_SKIPPED = new Set<string>();

function blank(literal: string): string {
  return literal.replaceAll(/[^\n]/gu, ' ');
}

export function blankLiterals(text: string): string {
  return text.replaceAll(LITERALS, blank);
}

export function blankComments(text: string): string {
  return text.replaceAll(LITERALS, (literal) =>
    literal.startsWith('//') || literal.startsWith('/*') ? blank(literal) : literal,
  );
}

export function withoutNested(text: string, open: string, close: string): string {
  let depth = 0;
  return text
    .split('')
    .filter((character) => {
      depth += character === open ? 1 : 0;
      const kept = depth === 0;
      depth -= character === close ? 1 : 0;
      return kept && character !== close;
    })
    .join('');
}

export function withoutGenerics(text: string): string {
  return withoutNested(text, '<', '>');
}

function blankedBlocks(text: string, keeps: (depth: number, character: string) => boolean): string {
  let depth = 0;
  let kept = '';
  for (const character of text) {
    depth -= character === '}' ? 1 : 0;
    kept += keeps(depth, character) ? character : ' ';
    depth += character === '{' ? 1 : 0;
  }
  return kept;
}

export function blankBlockBodies(text: string): string {
  return blankedBlocks(text, (depth) => depth === 0);
}

export function blankBlocks(text: string): string {
  return blankedBlocks(text, (depth, character) => depth === 0 && character !== '}');
}

export function pathInside(base: string, relative: string): string {
  const root = path.resolve(base);
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error(`${relative} is outside ${base}`);
  }
  return full;
}

export function sourceFilesUnder(
  root: string,
  extensions: readonly string[],
  options: SourceListing = { skipped: undefined, includeIgnored: false },
): string[] {
  const { skipped = SKIPPED_DIRECTORIES, ...listing } = options;
  return listFiles(root, {
    ...listing,
    skipDirectory: (_, entry) => skipped.has(entry.name),
  })
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .sort();
}

export function javaFilesUnder(root: string): string[] {
  return sourceFilesUnder(root, [JAVA_EXTENSION], {
    skipped: undefined,
    includeIgnored: true,
  });
}

export function readJavaSource(file: string): string | undefined {
  return existsSync(file) ? blankLiterals(readFileSync(file, 'utf8')) : undefined;
}

export function packageOf(text: string): string {
  return PACKAGE.exec(text)?.[1] ?? '';
}

export function importsOf(text: string): string[] {
  return [...text.matchAll(IMPORT)].map((match) => match[1] ?? '');
}

export function staticImportsOf(text: string): StaticImport[] {
  return [...text.matchAll(STATIC_IMPORT)].map((match): StaticImport => {
    const imported = match[1] ?? '';
    return match[2] === undefined
      ? {
          owner: imported.split('.').slice(0, -1).join('.'),
          name: imported.split('.').at(-1) ?? '',
        }
      : { owner: imported, name: '*' };
  });
}

export function offsetOf(
  text: string,
  { line, column = 1 }: SourceLocation,
  separator: string | RegExp = '\n',
): number {
  const lines = text.split(separator);
  const before = lines.slice(0, line - 1).reduce((sum, current) => sum + current.length + 1, 0);
  return before + column - 1;
}

export function expressionAt(text: string, start: number): string {
  let depth = 0;
  let end = start;
  for (const character of text.slice(start)) {
    depth += DEPTH_CHANGE[character] ?? 0;
    if (depth < 0 || (depth === 0 && EXPRESSION_END.includes(character))) {
      return text.slice(start, end);
    }
    end += character.length;
  }
  return text.slice(start);
}

export function sourceRootsOf(
  project: SourceProject,
  { kotlin, test }: { kotlin: boolean; test: boolean },
): string[] {
  const java = test ? project.testSourceRoots : project.sourceRoots;
  const kotlinRoots = test ? project.kotlinTestSourceRoots : project.kotlinSourceRoots;
  return [...(java ?? []), ...(kotlin ? (kotlinRoots ?? []) : [])].filter(
    (root) => root !== '' && !OUTSIDE_SOURCES.test(root),
  );
}

function projectSources<Project extends SourceProject>(
  projectRoot: string,
  { project, kotlin, test }: { project: Project; kotlin: boolean; test: boolean },
): [string, Project][] {
  const extensions = kotlin ? [JAVA_EXTENSION, '.kt'] : [JAVA_EXTENSION];
  const excluded = new Set(project.kotlinExcludedFiles ?? []);
  return [...new Set(sourceRootsOf(project, { kotlin, test }))]
    .flatMap((root) =>
      sourceFilesUnder(pathInside(projectRoot, root), extensions, {
        skipped: NOTHING_SKIPPED,
        includeIgnored: false,
      }),
    )
    .map((full): [string, Project] => [
      path.relative(projectRoot, full).replaceAll('\\', '/'),
      project,
    ])
    .filter(([file]) => !excluded.has(file));
}

export function projectSourceFiles<Project extends SourceProject>(
  projectRoot: string,
  {
    projects,
    kotlin,
    exclude = [],
    test,
  }: {
    projects: readonly Project[];
    kotlin: boolean;
    exclude?: readonly string[] | undefined;
    test: boolean;
  },
): Map<string, Project> {
  const excluded = exclude.map((glob) => matcherOf(glob));
  const found = projects
    .flatMap((project) => projectSources(projectRoot, { project, kotlin, test }))
    .filter(([file]) => !excluded.some((matcher) => matcher.test(file)));
  return new Map(found.toReversed());
}
