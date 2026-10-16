import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const INLINE_SOURCE_MAP =
  /\/\/[#@] sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?;base64,(?<data>[\w+/=]+)\s*$/u;
const SOURCE_URL_COMMENT = /^\s*\/\/[#@] sourceURL=\S*\s*$/u;

function withoutWarnings(operation) {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = () => {};
  try {
    return operation();
  } finally {
    process.emitWarning = emitWarning;
  }
}

function executedCode(file, source) {
  return TYPESCRIPT_FILE.test(file)
    ? withoutWarnings(() => stripTypeScriptTypes(source, { mode: 'strip' }))
    : source;
}

export function scriptFile(url) {
  if (url.startsWith('file://')) {
    return fileURLToPath(url.split('?')[0]);
  }
  return path.isAbsolute(url) ? url : undefined;
}

export function readLoadedSources(directory) {
  const sources = new Map();
  if (directory === undefined) {
    return sources;
  }
  for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.json'))) {
    const recorded = path.join(directory, path.basename(name));
    const { url, source } = JSON.parse(readFileSync(recorded, 'utf8'));
    const file = scriptFile(url);
    if (file !== undefined) {
      sources.set(file, [...(sources.get(file) ?? []), source]);
    }
  }
  return sources;
}

function scriptLength(functions) {
  return Math.max(
    0,
    ...functions.flatMap(({ ranges }) => ranges.map(({ endOffset }) => endOffset)),
  );
}

function sourceMapOf(code, cachedSourceMap) {
  const inline = INLINE_SOURCE_MAP.exec(code);
  if (inline !== null) {
    return JSON.parse(Buffer.from(inline.groups.data, 'base64').toString('utf8'));
  }
  return cachedSourceMap;
}

function isFileCode(code, fileCode) {
  return (
    code === fileCode ||
    (code.startsWith(fileCode) && SOURCE_URL_COMMENT.test(code.slice(fileCode.length)))
  );
}

export function executedScript({ file, functions, loaded = [], cachedSourceMap }) {
  const fileCode = executedCode(file, readFileSync(file, 'utf8'));
  if (functions === undefined) {
    return { code: fileCode };
  }
  const length = scriptLength(functions);
  const code = [...loaded, fileCode].find((candidate) => candidate.length === length);
  if (code === undefined) {
    throw new Error(
      `the code that ran (${String(length)} characters) is not the file (${String(fileCode.length)} characters), and no copy of it was recorded`,
    );
  }
  if (isFileCode(code, fileCode)) {
    return { code };
  }
  const sourceMap = sourceMapOf(code, cachedSourceMap);
  if (sourceMap === undefined) {
    throw new Error(
      'a loader rewrote it without a source map, so its coverage cannot be mapped back to the file',
    );
  }
  return { code, sourceMap };
}
