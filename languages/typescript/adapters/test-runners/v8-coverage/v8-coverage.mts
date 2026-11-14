import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Options, type Program, parse } from 'acorn';
import { convert } from 'ast-v8-to-istanbul';
import {
  type CoveredScript,
  type FunctionCoverage,
  executedScript,
  readLoadedSources,
  scriptFile,
  sourceMapOf,
} from './executed-script.mts';
import { unmappedNodeFilter } from './mapped-nodes.mts';
import { type Coverage, mergedCoverage } from './merge-coverage.mts';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../shared/values/readers.mts';

type SourceType = 'script' | 'module';

export type V8CoverageFiles = {
  readonly coverageDirectory: string;
  readonly sourcesDirectory: string;
  readonly sourceFiles: readonly string[];
  readonly outputFile: string;
};

const NODE_RUNNABLE_FILE = /\.[cm]?[jt]s$/u;
const COMMONJS_FILE = /\.c[jt]s$/u;

const PARSE_OPTIONS: Pick<Options, 'ecmaVersion' | 'locations' | 'allowHashBang'> = {
  ecmaVersion: 'latest',
  locations: true,
  allowHashBang: true,
};

function parseExecuted(file: string, code: string): Program {
  const sourceTypes: readonly SourceType[] = COMMONJS_FILE.test(file)
    ? ['script']
    : ['module', 'script'];
  const errors: unknown[] = [];
  for (const sourceType of sourceTypes) {
    try {
      return parse(code, { ...PARSE_OPTIONS, sourceType, allowReturnOutsideFunction: true });
    } catch (error) {
      errors.push(error);
    }
  }
  throw new AggregateError(errors, `it parses neither as ${sourceTypes.join(' nor as ')}`);
}

function untouchedFunctions(code: string): FunctionCoverage[] {
  return [
    {
      functionName: '',
      isBlockCoverage: true,
      ranges: [{ startOffset: 0, endOffset: code.length, count: 0 }],
    },
  ];
}

function coverageOfFile(file: string, data: object): Coverage | undefined {
  const entries = Object.entries(data);
  const entry =
    entries.find(([key]) => path.resolve(key) === file) ??
    (entries.length === 1 ? entries[0] : undefined);
  return entry === undefined ? undefined : { ...fieldsOf(entry[1]), path: file };
}

async function fileCoverage(script: CoveredScript): Promise<Coverage | undefined> {
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

function isFunctionList(value: unknown): value is FunctionCoverage[] {
  return Array.isArray(value) && value.every((entry) => Array.isArray(fieldOf(entry, 'ranges')));
}

function coverageScripts(coverage: unknown): CoveredScript[] {
  const sourceMaps = fieldOf(coverage, 'source-map-cache');
  return listOf(fieldOf(coverage, 'result')).flatMap((script) => {
    const url = textOf(fieldOf(script, 'url'));
    const file = scriptFile(url);
    const functions = fieldOf(script, 'functions');
    return file === undefined
      ? []
      : [
          {
            file,
            functions: isFunctionList(functions) ? functions : undefined,
            cachedSourceMap: sourceMapOf(fieldOf(fieldOf(sourceMaps, url), 'data')),
          },
        ];
  });
}

function loadedScripts(
  coverageDirectory: string,
  sourcesDirectory: string,
  isCovered: (file: string) => boolean,
): CoveredScript[] {
  const loaded = readLoadedSources(sourcesDirectory);
  return readdirSync(coverageDirectory)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) =>
      coverageScripts(
        JSON.parse(readFileSync(path.join(coverageDirectory, path.basename(name)), 'utf8')),
      ),
    )
    .filter(({ file }) => isCovered(file))
    .map((script) => ({ ...script, loaded: loaded.get(script.file) }));
}

async function convertedCoverage(
  scripts: readonly CoveredScript[],
): Promise<Map<string, Coverage>> {
  const coverage = new Map<string, Coverage>();
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
}: V8CoverageFiles): Promise<void> {
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
