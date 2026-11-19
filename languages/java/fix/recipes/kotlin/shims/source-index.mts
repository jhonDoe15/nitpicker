import path from 'node:path';
import { projectFilesUnder as untypedProjectFilesUnder } from '../../../../../../shared/project-files/project-files.mjs';
import type { FixRecipe, RecipeFix, RuleRef } from '../../../../../../core/fix/typed/fix-types.mts';
import { isKotlinTestPath } from '../shared/kotlin-recipe.mts';
import { escapeRegExp, scanKotlinSource } from '../shared/kotlin-scan.mts';
import type { KotlinEdit, ScannedKotlin } from '../shared/kotlin-scan.mts';
import { removalSpan } from '../shared/spans.mts';

export type Source = {
  readonly path: string;
  readonly text: string;
  readonly kotlin: boolean;
  readonly scanned: ScannedKotlin;
};

export type PathEdit = KotlinEdit & { readonly path: string };

export type Use = { readonly source: Source; readonly offset: number };

const projectFilesUnder: (directory: string) => string[] = untypedProjectFilesUnder;
const KOTLIN_FILE = /\.kt$/u;
const PROJECT_SOURCE = /\.(?:kt|java)$/u;
const GENERATED =
  /(?:^|\/)(?:(?:build|target|out)\/|generated-(?:test-)?sources\/|generated\/(?:java|kotlin|sources)\/)/u;
const DECLARATION_KEYWORD = '(?:class|interface|object|typealias|fun|val|var)';
const PACKAGE = /^[ \t]*package[ \t]+([\w.]+)/mu;
const ANNOTATION_LINE = /^[ \t]*@/u;

type PlanFiles = {
  readonly files: readonly { path: string; text: string }[];
  readonly projectRoot?: string | undefined;
  readonly read?: ((name: string) => string | undefined) | undefined;
};

function sourceOf(file: { path: string; text: string }): Source {
  const kotlin = KOTLIN_FILE.test(file.path);
  return { ...file, kotlin, scanned: scanKotlinSource(kotlin ? file.text : '') };
}

function sourcesOf({ files, projectRoot, read }: PlanFiles): Source[] {
  if (projectRoot === undefined || read === undefined) {
    return files.map(sourceOf);
  }
  const changed = new Map(files.map((file) => [file.path, file]));
  const names = projectFilesUnder(projectRoot)
    .map((file) => path.relative(projectRoot, file).split(path.sep).join('/'))
    .filter((name) => PROJECT_SOURCE.test(name) && !GENERATED.test(name));
  return [...new Set([...changed.keys(), ...names])].flatMap((name) => {
    const text = changed.get(name)?.text ?? read(name);
    return text === undefined ? [] : [sourceOf({ path: name, text })];
  });
}

export function packageOf({ scanned }: Source): string {
  return PACKAGE.exec(scanned.code)?.[1] ?? '';
}

export function usesOf(sources: readonly Source[], name: string): Use[] {
  const pattern = new RegExp(`(?<![\\w\u0060])${escapeRegExp(name)}(?![\\w\u0060])`, 'gu');
  return sources
    .filter(({ kotlin }) => kotlin)
    .flatMap((source) =>
      [...source.scanned.code.matchAll(pattern)].map(({ index }) => ({ source, offset: index })),
    );
}

export function declaresName(sources: readonly Source[], name: string): number {
  const pattern = new RegExp(
    String.raw`\b${DECLARATION_KEYWORD}\s+(?:<[^>]*>\s*)?(?:[\w.]+\.)?${escapeRegExp(name)}\b`,
    'gu',
  );
  return sources
    .filter(({ kotlin }) => kotlin)
    .reduce((total, { scanned }) => total + [...scanned.code.matchAll(pattern)].length, 0);
}

export function wordPattern(name: string, flags: string, after?: RegExp): RegExp {
  return after === undefined
    ? new RegExp(String.raw`\b${escapeRegExp(name)}\b`, flags)
    : new RegExp(String.raw`\b${escapeRegExp(name)}\b${after.source}`, flags);
}

export function mentionedInJava(sources: readonly Source[], pattern: RegExp): boolean {
  return sources.some(({ kotlin, text }) => !kotlin && pattern.test(text));
}

export function isQualifiedBy(code: string, offset: number, qualifier: string): boolean {
  return (
    code.charAt(offset - 1) === '.' &&
    qualifier !== '' &&
    new RegExp(String.raw`(?<![\w.])${escapeRegExp(qualifier)}$`, 'u').test(
      code.slice(0, offset - 1),
    )
  );
}

export function importLine(
  { scanned }: Source,
  offset: number,
): { start: number; end: number } | undefined {
  const start = scanned.code.lastIndexOf('\n', offset) + 1;
  const newline = scanned.code.indexOf('\n', offset);
  const end = newline === -1 ? scanned.code.length : newline;
  return /^[ \t]*import[ \t]+[\w.]+[ \t]*$/u.test(scanned.code.slice(start, end))
    ? { start, end }
    : undefined;
}

function importsName({ scanned }: Source, qualified: string): boolean {
  return new RegExp(String.raw`^[ \t]*import[ \t]+${escapeRegExp(qualified)}[ \t]*$`, 'mu').test(
    scanned.code,
  );
}

export function renameUses(
  uses: readonly Use[],
  rename: { readonly from: string; readonly to: string; readonly qualified: string },
): PathEdit[] {
  return uses.map(({ source, offset }) => {
    const line = importLine(source, offset);
    const drop = line !== undefined && importsName(source, rename.qualified);
    if (line !== undefined && drop) {
      return { ...removalSpan(source.text, line.start, line.end), text: '', path: source.path };
    }
    return { start: offset, end: offset + rename.from.length, text: rename.to, path: source.path };
  });
}

export function declarationSpan(
  { text, scanned }: Source,
  start: number,
  end: number,
): { start: number; end: number } | undefined {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const above =
    text
      .slice(0, Math.max(0, lineStart - 1))
      .split('\n')
      .at(-1) ?? '';
  const removal = removalSpan(text, start, end);
  const comment = scanned.comments.find(
    (entry) => entry.kind !== 'line' && text.slice(entry.end, removal.start).trim() === '',
  );
  if (ANNOTATION_LINE.test(above)) {
    return undefined;
  }
  const span =
    comment === undefined
      ? removal
      : { start: text.lastIndexOf('\n', comment.start - 1) + 1, end: removal.end };
  const spaced =
    text.slice(span.start - 2, span.start) === '\n\n' && text.charAt(span.end) === '\n';
  return spaced ? { start: span.start, end: span.end + 1 } : span;
}

type ProjectRecipe = {
  readonly id: string;
  readonly rule: RuleRef;
  readonly where: 'main' | 'test';
  readonly find: (input: {
    readonly sources: readonly Source[];
    readonly source: Source;
    readonly read: ((name: string) => string | undefined) | undefined;
  }) => RecipeFix[];
};

function wantedIn({ kotlin, path }: Source, changed: ReadonlySet<string>, where: string): boolean {
  return kotlin && changed.has(path) && isKotlinTestPath(path) === (where === 'test');
}

export function projectRecipe({ id, rule, where, find }: ProjectRecipe): FixRecipe {
  return {
    id,
    rules: [rule],
    presets: ['kotlin'],
    scope: 'project',
    safety: 'review',
    accepts: (name) => PROJECT_SOURCE.test(name),
    plan({ files, projectRoot, read }) {
      const sources = sourcesOf({ files, projectRoot, read });
      const changed = new Set(files.map(({ path }) => path));
      return {
        fixes: sources
          .filter((source) => wantedIn(source, changed, where))
          .flatMap((source) => find({ sources, source, read })),
      };
    },
  };
}
