import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const INLINE_SOURCE_MAP =
  /\/\/[#@] sourceMappingURL=data:application\/json(?:;charset=[\w-]+)?;base64,(?<data>[\w+/=]+)\s*$/u;
const SOURCE_URL_COMMENT = /^\s*\/\/[#@] sourceURL=\S*\s*$/u;
const BYTE_ORDER_MARK = '\uFEFF';
const UNSUPPORTED_SYNTAX = 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX';

function withoutWarnings(operation) {
  const emitWarning = process.emitWarning.bind(process);
  process.emitWarning = () => {};
  try {
    return operation();
  } finally {
    process.emitWarning = emitWarning;
  }
}

function inlineSourceMap(code) {
  const inline = INLINE_SOURCE_MAP.exec(code);
  return inline === null
    ? undefined
    : JSON.parse(Buffer.from(inline.groups.data, 'base64').toString('utf8'));
}

function typeScriptCode(file, source) {
  try {
    return { code: withoutWarnings(() => stripTypeScriptTypes(source, { mode: 'strip' })) };
  } catch (error) {
    if (error?.code !== UNSUPPORTED_SYNTAX) {
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

function fileCode(file) {
  const text = readFileSync(file, 'utf8');
  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  return TYPESCRIPT_FILE.test(file) ? typeScriptCode(file, source) : { code: source };
}

export function scriptFile(url) {
  if (url.startsWith('file://')) {
    const parsed = new URL(url);
    return parsed.search === '' && parsed.hash === '' ? fileURLToPath(parsed) : undefined;
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

function isFileCode(code, file) {
  return (
    file.sourceMap === undefined &&
    (code === file.code ||
      (code.startsWith(file.code) && SOURCE_URL_COMMENT.test(code.slice(file.code.length))))
  );
}

function recordedScript(file, code, cachedSourceMap) {
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

export function executedScript({ file, functions, loaded = [], cachedSourceMap }) {
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
