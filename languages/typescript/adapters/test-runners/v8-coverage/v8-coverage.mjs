import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'acorn';
import { convert } from 'ast-v8-to-istanbul';
import { executedScript, readLoadedSources, scriptFile } from './executed-script.mjs';
import { unmappedNodeFilter } from './mapped-nodes.mjs';
import { mergedCoverage } from './merge-coverage.mjs';

const NODE_RUNNABLE_FILE = /\.[cm]?[jt]s$/u;
const COMMONJS_FILE = /\.c[jt]s$/u;

const PARSE_OPTIONS = { ecmaVersion: 'latest', locations: true, allowHashBang: true };

function parseExecuted(file, code) {
  const sourceTypes = COMMONJS_FILE.test(file) ? ['script'] : ['module', 'script'];
  const errors = [];
  for (const sourceType of sourceTypes) {
    try {
      return parse(code, { ...PARSE_OPTIONS, sourceType, allowReturnOutsideFunction: true });
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, `it parses neither as ${sourceTypes.join(' nor as ')}`);
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

function coverageOfFile(file, data) {
  const entries = Object.entries(data);
  const [, coverage] =
    entries.find(([key]) => path.resolve(key) === file) ?? (entries.length === 1 ? entries[0] : []);
  return coverage === undefined ? undefined : { ...coverage, path: file };
}

async function fileCoverage(script) {
  const { file, functions } = script;
  try {
    const { code, sourceMap } = executedScript(script);
    const ast = parseExecuted(file, code);
    const data = await convert({
      code,
      ast,
      wrapperLength: 0,
      ...(sourceMap === undefined
        ? {}
        : { sourceMap, ignoreNode: unmappedNodeFilter({ code, ast, sourceMap }) }),
      coverage: { url: pathToFileURL(file).href, functions: functions ?? untouchedFunctions(code) },
    });
    return coverageOfFile(file, data);
  } catch (error) {
    throw new Error(
      `Could not read the coverage of ${file}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

function coverageScripts(coverage) {
  const sourceMaps = coverage['source-map-cache'] ?? {};
  return coverage.result.map((script) => ({
    file: scriptFile(script.url),
    functions: script.functions,
    cachedSourceMap: sourceMaps[script.url]?.data,
  }));
}

function loadedScripts(coverageDirectory, sourcesDirectory, isCovered) {
  const loaded = readLoadedSources(sourcesDirectory);
  return readdirSync(coverageDirectory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) =>
      coverageScripts(
        JSON.parse(readFileSync(path.join(coverageDirectory, path.basename(name)), 'utf8')),
      ),
    )
    .filter(({ file }) => file !== undefined && isCovered(file))
    .map((script) => ({ ...script, loaded: loaded.get(script.file) }));
}

async function convertedCoverage(scripts) {
  const coverage = new Map();
  for (const script of scripts) {
    const data = await fileCoverage(script);
    if (data !== undefined) {
      coverage.set(script.file, mergedCoverage(coverage.get(script.file), data));
    }
  }
  return coverage;
}

export async function writeV8Coverage({
  coverageDirectory,
  sourcesDirectory,
  sourceFiles,
  outputFile,
}) {
  const wanted = new Set(sourceFiles);
  const coverage = await convertedCoverage(
    loadedScripts(coverageDirectory, sourcesDirectory, (file) => wanted.has(file)),
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
