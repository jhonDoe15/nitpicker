import path from 'node:path';
import { fieldOf, fieldsOf, listOf } from '../../../../../shared/values/readers.mts';
import {
  type EngineExtraction,
  type ExtractedDependency,
  type KeptDependency,
  engineExtraction,
} from './engine-dependencies.mts';

type CruiseOptions = Record<string, unknown>;
type Gather = (fileAndDirectoryArray: unknown, options: CruiseOptions) => string[];
type Extract = (options: CruiseOptions, fileName: string, transpileOptions: unknown) => unknown[];

const ENGINE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs']);
const MODULE_SYSTEMS = ['es6', 'cjs', 'tsd', 'amd'];
const ES_NEXT_MODULE = 99;
const ELISION_OPTIONS = [
  'jsx',
  'jsxFactory',
  'jsxFragmentFactory',
  'reactNamespace',
  'verbatimModuleSyntax',
  'preserveValueImports',
  'importsNotUsedAsValues',
  'experimentalDecorators',
  'emitDecoratorMetadata',
];

let extracted = new Map<string, EngineExtraction>();

function isEngineFile(fileName: string): boolean {
  return ENGINE_EXTENSIONS.has(path.extname(fileName)) && !/\.d\.[mc]?ts$/u.test(fileName);
}

export function readsLikeEngine(options: CruiseOptions): boolean {
  const systems = listOf(options['moduleSystems']);
  return (
    listOf(options['exoticRequireStrings']).length === 0 &&
    options['detectJSDocImports'] !== true &&
    options['detectProcessBuiltinModuleCalls'] !== true &&
    MODULE_SYSTEMS.every((system) => systems.includes(system))
  );
}

export function transpilesLikeEngine(transpileOptions: unknown): boolean {
  const babel = fieldOf(transpileOptions, 'babelConfig');
  const compilerOptions = fieldOf(fieldOf(transpileOptions, 'tsConfig'), 'options');
  return (
    Object.keys(fieldsOf(babel)).length === 0 &&
    fieldOf(compilerOptions, 'module') === ES_NEXT_MODULE &&
    ELISION_OPTIONS.every((option) => fieldOf(compilerOptions, option) === undefined)
  );
}

export function withEngineSources(gather: Gather): Gather {
  return (fileAndDirectoryArray, options) => {
    const sources = gather(fileAndDirectoryArray, options);
    extracted = readsLikeEngine(options)
      ? engineExtraction({
          baseDirectory: String(options['baseDir'] ?? process.cwd()),
          files: sources.filter(isEngineFile),
        })
      : new Map();
    return sources;
  };
}

function engineFile(
  options: CruiseOptions,
  fileName: string,
  transpileOptions: unknown,
): EngineExtraction | undefined {
  const found = extracted.get(fileName);
  return found !== undefined && readsLikeEngine(options) && transpilesLikeEngine(transpileOptions)
    ? found
    : undefined;
}

function copyOf(dependency: ExtractedDependency): ExtractedDependency {
  return { ...dependency, dependencyTypes: [...dependency.dependencyTypes] };
}

export function withEngineTypeScriptExtract(extract: Extract): Extract {
  return (options, fileName, transpileOptions) => {
    const found = engineFile(options, fileName, transpileOptions);
    if (found === undefined) return extract(options, fileName, transpileOptions);
    const systems = listOf(options['moduleSystems']);
    return found.dependencies
      .filter((dependency) => systems.includes(dependency.moduleSystem))
      .map(copyOf);
  };
}

export function withEngineJavaScriptExtract(extract: Extract): Extract {
  return (options, fileName, transpileOptions) => {
    const found =
      options['tsPreCompilationDeps'] === 'specify'
        ? engineFile(options, fileName, transpileOptions)
        : undefined;
    return found === undefined
      ? extract(options, fileName, transpileOptions)
      : found.kept.map((kept): KeptDependency => ({ ...kept }));
  };
}
