import { escapeRegExp } from '../../../adapters/typed/regex-escape.mts';
import {
  depthsOf,
  maskedOf,
  methodsOf,
  typeBlocksOf,
  type Masked,
  type Method,
  type TypeBlock,
} from './java-text.mts';

type ImportLine = {
  readonly fqn: string;
  readonly simple: string;
  readonly isStatic: boolean;
  readonly wildcard: boolean;
  readonly start: number;
  readonly end: number;
};
export type Source = Masked & {
  readonly path: string;
  readonly text: string;
  readonly depths: Int32Array;
  readonly packageName: string;
  readonly imports: readonly ImportLine[];
  readonly types: readonly TypeBlock[];
  readonly methods: readonly Method[];
};
export type SpanEdit = { readonly start: number; readonly end: number; readonly text: string };
export type Standing = 'same' | 'other' | 'free';

const IMPORT = /^[ \t]*import\s+(static\s+)?([\w.]+?)(\.\*)?\s*;[ \t]*\r?\n?/gmu;
const PACKAGE = /^\s*package\s+([\w.]+)\s*;[ \t]*\r?\n?/mu;

function importsOf(code: string): ImportLine[] {
  return [...code.matchAll(IMPORT)].map((found) => {
    const fqn = found[2] ?? '';
    return {
      fqn,
      simple: fqn.slice(fqn.lastIndexOf('.') + 1),
      isStatic: found[1] !== undefined,
      wildcard: found[3] !== undefined,
      start: found.index,
      end: found.index + found[0].length,
    };
  });
}

export function sourceOf(path: string, text: string): Source {
  const masked = maskedOf(text);
  const depths = depthsOf(masked.code);
  return {
    ...masked,
    path,
    text,
    depths,
    packageName: PACKAGE.exec(masked.code)?.[1] ?? '',
    imports: importsOf(masked.code),
    types: typeBlocksOf(masked.code, depths),
    methods: methodsOf(masked.code, depths),
  };
}

export function headOf(source: Source, type: TypeBlock): string {
  const before = source.code.slice(0, type.start);
  return before.slice(Math.max(before.lastIndexOf(';'), before.lastIndexOf('}'), 0));
}

export function declaresType(source: Source, simple: string): boolean {
  return new RegExp(
    String.raw`\b(?:class|interface|enum|record)\s+${escapeRegExp(simple)}\b`,
    'u',
  ).test(source.code);
}

export function standingOf(source: Source, simple: string, fqn: string): Standing {
  const imported = source.imports.filter(
    (line) => !line.isStatic && !line.wildcard && line.simple === simple,
  );
  if (imported.some((line) => line.fqn === fqn)) {
    return 'same';
  }
  return imported.length > 0 || declaresType(source, simple) ? 'other' : 'free';
}

export function importEdit(source: Source, fqn: string): SpanEdit {
  const single = source.imports.filter((line) => !line.isStatic);
  const next = single.find((line) => line.fqn > fqn);
  const last = source.imports.at(-1);
  const line = `import ${fqn};\n`;
  if (next !== undefined) {
    return { start: next.start, end: next.start, text: line };
  }
  if (last !== undefined) {
    return { start: last.end, end: last.end, text: line };
  }
  const header = PACKAGE.exec(source.code);
  const at = header === null ? 0 : header.index + header[0].length;
  return { start: at, end: at, text: header === null ? `${line}\n` : `\n${line}` };
}

export function wordCount(code: string, word: string): number {
  return [...code.matchAll(new RegExp(String.raw`\b${escapeRegExp(word)}\b`, 'gu'))].length;
}

export function unusedImport(
  source: Source,
  simple: string,
  removed: number,
): SpanEdit | undefined {
  const line = source.imports.find(
    (entry) => !entry.isStatic && !entry.wildcard && entry.simple === simple,
  );
  if (line === undefined) {
    return undefined;
  }
  const inImport = wordCount(source.code.slice(line.start, line.end), simple);
  const inCode = wordCount(source.code, simple) - inImport;
  const inText = wordCount(source.text, simple) - inImport;
  return inCode === removed && inText === removed
    ? { start: line.start, end: line.end, text: '' }
    : undefined;
}
