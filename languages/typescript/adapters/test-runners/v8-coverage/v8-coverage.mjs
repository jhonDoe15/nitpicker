import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { convert } from 'ast-v8-to-istanbul';

const TYPESCRIPT_FILE = /\.[cm]?ts$/u;
const NODE_RUNNABLE_FILE = /\.[cm]?[jt]s$/u;
const COMMONJS_FILE = /\.c[jt]s$/u;

function withoutWarnings(operation) {
  const { emitWarning } = process;
  process.emitWarning = () => {};
  try {
    return operation();
  } finally {
    process.emitWarning = emitWarning;
  }
}

export function executedCode(file, source) {
  return TYPESCRIPT_FILE.test(file)
    ? withoutWarnings(() => stripTypeScriptTypes(source, { mode: 'strip' }))
    : source;
}

function scriptFile(url) {
  if (url.startsWith('file://')) return fileURLToPath(url.split('?')[0]);
  return path.isAbsolute(url) ? url : undefined;
}

function parseExecuted(file, code) {
  const options = { ecmaVersion: 'latest', locations: true, allowHashBang: true };
  try {
    return parse(code, {
      ...options,
      sourceType: COMMONJS_FILE.test(file) ? 'script' : 'module',
      allowReturnOutsideFunction: true,
    });
  } catch {
    return parse(code, { ...options, sourceType: 'script', allowReturnOutsideFunction: true });
  }
}

function untouchedFunctions(code) {
  return [
    {
      functionName: '',
      isBlockCoverage: true,
      ranges: [{ startOffset: 0, endOffset: code.length, count: 0 }],
    },
  ];
}

async function fileCoverage(file, functions) {
  const code = executedCode(file, readFileSync(file, 'utf8'));
  try {
    const data = await convert({
      code,
      ast: parseExecuted(file, code),
      wrapperLength: 0,
      coverage: { url: `file://${file}`, functions: functions ?? untouchedFunctions(code) },
    });
    return Object.values(data)[0];
  } catch (error) {
    throw new Error(
      `Could not read the coverage of ${file}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function sumCounts(left, right) {
  return Object.fromEntries(
    Object.entries(left).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.map((count, index) => count + (right[key]?.[index] ?? 0))
        : value + (right[key] ?? 0),
    ]),
  );
}

function merged(known, next) {
  if (known === undefined) return next;
  return {
    ...known,
    s: sumCounts(known.s, next.s),
    f: sumCounts(known.f, next.f),
    b: sumCounts(known.b, next.b),
  };
}

function loadedScripts(coverageDirectory, isCovered) {
  return readdirSync(coverageDirectory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => JSON.parse(readFileSync(path.join(coverageDirectory, name), 'utf8')).result)
    .map((script) => ({ file: scriptFile(script.url), functions: script.functions }))
    .filter(({ file }) => file !== undefined && isCovered(file));
}

async function convertedCoverage(scripts) {
  const coverage = new Map();
  for (const { file, functions } of scripts) {
    coverage.set(file, merged(coverage.get(file), await fileCoverage(file, functions)));
  }
  return coverage;
}

export async function writeV8Coverage({ coverageDirectory, sourceFiles, outputFile }) {
  const wanted = new Set(sourceFiles);
  const coverage = await convertedCoverage(
    loadedScripts(coverageDirectory, (file) => wanted.has(file)),
  );
  const untouched = sourceFiles
    .filter((file) => !coverage.has(file) && NODE_RUNNABLE_FILE.test(file))
    .map((file) => ({ file, functions: undefined }));
  for (const [file, data] of await convertedCoverage(untouched)) {
    coverage.set(file, data);
  }
  mkdirSync(path.dirname(outputFile), { recursive: true });
  writeFileSync(outputFile, `${JSON.stringify(Object.fromEntries(coverage))}\n`);
}
