import { lineAt as untypedLineAt } from '../../../../shared/conventions/lines.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  blankLiterals as untypedBlankLiterals,
  packageOf as untypedPackageOf,
  pathInside as untypedPathInside,
  sourceFilesUnder as untypedSourceFilesUnder,
} from './java-sources.mjs';

type Declared = { readonly line: number; readonly entryPoint: boolean };
type DeclaredEntry = readonly [string, Declared];
type FileDeclaration = readonly [string, Declared & { readonly file: string }];
type BodyRange = { readonly open: number; readonly close: number };
type Scan = {
  readonly text: string;
  readonly depths: Int32Array;
  readonly qualify: (name: string) => string;
};

const lineAt: (text: string, index: number) => number = untypedLineAt;
const blankLiterals: (text: string) => string = untypedBlankLiterals;
const packageOf: (text: string) => string = untypedPackageOf;
const pathInside: (base: string, relative: string) => string = untypedPathInside;
const sourceFilesUnder: (root: string, extensions: readonly string[]) => string[] =
  untypedSourceFilesUnder;

const SOURCE_EXTENSIONS = ['.java', '.kt'];
const DECLARATION =
  /\b(?:class|interface|enum|record|object)\s+(?!(?:class|interface)\b)([A-Za-z_$][\w$]*)/gu;
const KOTLIN_MODIFIERS =
  'public|internal|private|inline|suspend|operator|infix|tailrec|external|actual|expect|const|lateinit';
const TOP_LEVEL_MEMBER = new RegExp(
  String.raw`^[ \t]*(?:@[\w.:]+(?:\([^)\n]*\))?\s+)*(?:(?:${KOTLIN_MODIFIERS})\s+)*(fun|val|var)\b`,
  'gmu',
);
const JAVA_MAIN = /\bstatic\s+(?:final\s+)?void\s+main\s*\(/u;
const MAIN_PARAMETER_PREFIX = String.raw`(?:final\s+|@[\w.]+(?:\([^()]*\))?\s+)*(?:java\.lang\.)?String`;
const MAIN_PARAMETER_ARRAY = String.raw`(?:\s*(?:\[\s*\]|\.\.\.)\s*\w+|\s+\w+\s*\[\s*\])`;
const JAVA_MAIN_METHOD = new RegExp(
  String.raw`\bvoid\s+main\s*\(\s*(?:${MAIN_PARAMETER_PREFIX}${MAIN_PARAMETER_ARRAY}\s*)?\)`,
  'gu',
);
const KOTLIN_STATIC_MAIN = /@JvmStatic\s+(?:\w+\s+)*fun\s+main\s*\(/u;
const KOTLIN_MAIN = /^fun\s+main\s*\(/u;
const JVM_NAME = /@file\s*:\s*JvmName\(\s*"([^"]+)"\s*\)/u;
const OPENING = new Set(['{', '(']);
const CLOSING = new Set(['}', ')']);

function depthsOf(text: string): Int32Array {
  const depths = new Int32Array(text.length + 1);
  for (const [index, character] of text.split('').entries()) {
    const change = (OPENING.has(character) ? 1 : 0) - (CLOSING.has(character) ? 1 : 0);
    depths[index + 1] = (depths[index] ?? 0) + change;
  }
  return depths;
}

function bodyRange(text: string, depths: Int32Array, start: number): BodyRange | undefined {
  const depth = depths[start];
  const open = depths.findIndex(
    (value, index) => index >= start && value === depth && text[index] === '{',
  );
  if (open < 0) {
    return undefined;
  }
  const close = depths.findIndex((value, index) => index > open && value === depth);
  return { open, close: close < 0 ? text.length : close };
}

function bodyOf(text: string, depths: Int32Array, start: number): string {
  const range = bodyRange(text, depths, start);
  return range === undefined ? '' : text.slice(range.open, range.close);
}

function facadeName(file: string, raw: string): string {
  const named = JVM_NAME.exec(raw)?.[1];
  if (named !== undefined) {
    return named;
  }
  const base = path.basename(file, '.kt').replaceAll(/[^\w$]/gu, '_');
  return `${base.charAt(0).toUpperCase()}${base.slice(1)}Kt`;
}

function keywordIndex(match: RegExpExecArray): number {
  return match.index + match[0].length - (match[1] ?? '').length;
}

function facadeOf(file: string, raw: string, { text, depths, qualify }: Scan): DeclaredEntry[] {
  const members = [...text.matchAll(TOP_LEVEL_MEMBER)].filter(
    (match) => depths[keywordIndex(match)] === 0,
  );
  const [first] = members;
  if (first === undefined) {
    return [];
  }
  const entryPoint = members.some((match) => KOTLIN_MAIN.test(text.slice(keywordIndex(match))));
  const line = lineAt(text, keywordIndex(first));
  return [[qualify(facadeName(file, raw)), { line, entryPoint }]];
}

function declarationsIn(file: string): DeclaredEntry[] {
  const raw = readFileSync(file, 'utf8');
  const text = blankLiterals(raw);
  const depths = depthsOf(text);
  const packageName = packageOf(text);
  function qualify(name: string): string {
    return packageName === '' ? name : `${packageName}.${name}`;
  }
  const kotlin = file.endsWith('.kt');
  const mainPattern = kotlin ? KOTLIN_STATIC_MAIN : JAVA_MAIN;
  const classes = [...text.matchAll(DECLARATION)]
    .filter((match) => depths[match.index] === 0)
    .map((match): DeclaredEntry => [
      qualify(match[1] ?? ''),
      {
        line: lineAt(text, match.index),
        entryPoint: mainPattern.test(bodyOf(text, depths, match.index)),
      },
    ]);
  return [...classes, ...(kotlin ? facadeOf(file, raw, { text, depths, qualify }) : [])];
}

function hasBody(text: string, from: number): boolean {
  return /^[^;{]*\{/u.test(text.slice(from));
}

export function mainMethodLines(raw: string): [number, number][] {
  const text = blankLiterals(raw);
  const depths = depthsOf(text);
  return [...text.matchAll(JAVA_MAIN_METHOD)]
    .filter((match) => hasBody(text, match.index + match[0].length))
    .map((match) => bodyRange(text, depths, match.index))
    .filter((range) => range !== undefined)
    .map(({ open, close }) => [lineAt(text, open), lineAt(text, close - 1)]);
}

export function readDeclarations(
  projectRoot: string,
  roots: readonly string[],
): Map<string, Declared & { readonly file: string }> {
  const declarations = new Map<string, Declared & { readonly file: string }>();
  const files = [...new Set(roots)].flatMap((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), SOURCE_EXTENSIONS),
  );
  const found = files.flatMap((file) => {
    const relative = path.relative(projectRoot, file).replaceAll('\\', '/');
    return declarationsIn(file).map(([className, declared]): FileDeclaration => [
      className,
      { ...declared, file: relative },
    ]);
  });
  for (const [className, declared] of found) {
    if (!declarations.has(className)) {
      declarations.set(className, declared);
    }
  }
  return declarations;
}
