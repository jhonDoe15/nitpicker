import { readFileSync, readdirSync } from 'node:fs';
import type { Profiler } from 'node:inspector';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { EncodedSourceMap } from '@jridgewell/trace-mapping';
import { fieldOf, fieldsOf } from '../../../../../shared/values/readers.mts';

export type FunctionCoverage = Profiler.FunctionCoverage;

export type ExecutedCode = {
  readonly code: string;
  readonly sourceMap?: EncodedSourceMap | undefined;
};

export type CoveredScript = {
  readonly file: string;
  readonly functions: FunctionCoverage[] | undefined;
  readonly loaded?: readonly string[] | undefined;
  readonly cachedSourceMap?: EncodedSourceMap | undefined;
};

const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const INLINE_SOURCE_MAP =
  /\/\/[#@] sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?;base64,(?<data>[\w+/=]+)\s*$/u;
const SOURCE_URL_COMMENT = /^\s*\/\/[#@] sourceURL=\S*\s*$/u;
const BYTE_ORDER_MARK = '\uFEFF';
const UNSUPPORTED_SYNTAX = 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX';

function withoutWarnings<T>(operation: () => T): T {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = () => {};
  try {
    return operation();
  } finally {
    process.emitWarning = emitWarning;
  }
}

function isSourceList(value: unknown): value is EncodedSourceMap['sources'] {
  return Array.isArray(value) && value.every((name) => typeof name === 'string' || name === null);
}

function isNameList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((name) => typeof name === 'string');
}

export function sourceMapOf(value: unknown): EncodedSourceMap | undefined {
  const { mappings, names = [], sources } = fieldsOf(value);
  return typeof mappings === 'string' && isNameList(names) && isSourceList(sources)
    ? { ...fieldsOf(value), version: 3, names, sources, mappings }
    : undefined;
}

function inlineSourceMap(code: string): EncodedSourceMap | undefined {
  const data = INLINE_SOURCE_MAP.exec(code)?.groups?.['data'];
  return data === undefined
    ? undefined
    : sourceMapOf(JSON.parse(Buffer.from(data, 'base64').toString('utf8')));
}

function typeScriptCode(file: string, source: string): ExecutedCode {
  try {
    return { code: withoutWarnings(() => stripTypeScriptTypes(source, { mode: 'strip' })) };
  } catch (error) {
    if (fieldOf(error, 'code') !== UNSUPPORTED_SYNTAX) {
      throw error;
    }
    const code = withoutWarnings(() =>
      stripTypeScriptTypes(source, {
        mode: 'transform',
        sourceMap: true,
        sourceUrl: pathToFileURL(file).href,
      }),
    );
    return { code, sourceMap: inlineSourceMap(code) };
  }
}

function fileCode(file: string): ExecutedCode {
  const text = readFileSync(file, 'utf8');
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  return TYPESCRIPT_FILE.test(file) ? typeScriptCode(file, source) : { code: source };
}

export function scriptFile(url: string): string | undefined {
  if (url.startsWith('file://')) {
    const parsed = new URL(url);
    return parsed.search === '' && parsed.hash === '' ? fileURLToPath(parsed) : undefined;
  }
  return path.isAbsolute(url) ? url : undefined;
}

export function readLoadedSources(directory: string | undefined): Map<string, string[]> {
  const sources = new Map<string, string[]>();
  if (directory === undefined) {
    return sources;
  }
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const recorded = path.join(directory, path.basename(name));
    const parsed: unknown = JSON.parse(readFileSync(recorded, 'utf8'));
    const url = fieldOf(parsed, 'url');
    const source = fieldOf(parsed, 'source');
    const file = typeof url === 'string' ? scriptFile(url) : undefined;
    if (file !== undefined) {
      sources.set(file, [...(sources.get(file) ?? []), String(source)]);
    }
  }
  return sources;
}

function scriptLength(functions: readonly FunctionCoverage[]): number {
  return Math.max(
    0,
    ...functions.flatMap(({ ranges }) => ranges.map(({ endOffset }) => endOffset)),
  );
}

function isFileCode(code: string, file: ExecutedCode): boolean {
  return (
    file.sourceMap === undefined &&
    (code === file.code ||
      (code.startsWith(file.code) && SOURCE_URL_COMMENT.test(code.slice(file.code.length))))
  );
}

function recordedScript(
  file: string,
  code: string,
  cachedSourceMap: EncodedSourceMap | undefined,
): ExecutedCode {
  const sourceMap = inlineSourceMap(code) ?? cachedSourceMap;
  if (sourceMap !== undefined) {
    return { code, sourceMap };
  }
  if (isFileCode(code, fileCode(file))) {
    return { code };
  }
  throw new Error(
    'a loader rewrote it without a source map, so its coverage cannot be mapped back to the file',
  );
}

export function executedScript({
  file,
  functions,
  loaded = [],
  cachedSourceMap,
}: CoveredScript): ExecutedCode {
  if (functions === undefined) {
    return fileCode(file);
  }
  const length = scriptLength(functions);
  const recorded = loaded.find((candidate) => candidate.length === length);
  if (recorded !== undefined) {
    return recordedScript(file, recorded, cachedSourceMap);
  }
  const own = fileCode(file);
  if (own.code.length !== length) {
    throw new Error(
      `the code that ran (${String(length)} characters) is not the file (${String(own.code.length)} characters), and no copy of it was recorded`,
    );
  }
  return own;
}
