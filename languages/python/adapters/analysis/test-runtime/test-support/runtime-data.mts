import { evaluateTestRuntime } from '../../../../../../shared/rules/test-runtime/evaluate.mjs';
import { fieldOf, fieldsOf, listOf, textOf } from '../../../../../../shared/values/readers.mts';
import { analyzePythonTestRuntime } from '../python-test-runtime.mts';
import { JSON_NULL } from '../../typed/json-null.mts';
import type {
  ImportsByFile,
  ImportStatement,
  OtherModule,
  PythonModule,
} from '../../typed/python-graph-types.mts';

export type RuntimeOptions = {
  readonly pythonFiles: readonly string[];
  readonly testpaths: readonly string[];
  readonly django: boolean;
};
export type AnalyzeRequest = {
  readonly others: readonly OtherModule[];
  readonly modules?: readonly PythonModule[] | undefined;
  readonly imports?: ImportsByFile | undefined;
  readonly literals?: Readonly<Record<string, unknown>> | undefined;
  readonly runner?: string | undefined;
  readonly options?: RuntimeOptions | undefined;
};
type Row = Readonly<Record<string, unknown>>;
type TestEntry = {
  readonly test: string;
  readonly category: string;
  readonly directProductionModules: unknown;
  readonly runtimeProductionModules: unknown;
  readonly subprocessBridges: unknown;
};
type TestRuntimeReport = {
  readonly findings: readonly Row[];
  readonly tests: readonly TestEntry[];
  readonly exclusions: unknown;
  readonly summary: Row;
};
type FixtureEntry = { name: string; autouse: boolean; requests: readonly string[] };

const evaluate: (report: { findings: Row[] }, analyzerName: string) => Row[] = evaluateTestRuntime;
const NO_MODULE = JSON_NULL;

function dotted(file: string): string {
  return file
    .replace(/\.py$/u, '')
    .replace(/\/__init__$/u, '')
    .replaceAll('/', '.');
}

function production(name: string): PythonModule {
  return { file: `src/${name.replaceAll('.', '/')}.py`, module: name, isPackage: false };
}

export function other(file: string, kind = 'test'): OtherModule {
  return { file, module: dotted(file), kind, inRoots: false };
}

export function absolute(moduleName: string, ...names: string[]): ImportStatement {
  return { level: 0, module: moduleName, names };
}

export function plain(...names: string[]): ImportStatement {
  return { level: 0, module: NO_MODULE, names };
}

export function relative(level: number, moduleName: string, ...names: string[]): ImportStatement {
  return { level, module: moduleName, names };
}

export function typeOnly(statement: ImportStatement): ImportStatement {
  return { ...statement, typeOnly: true };
}

export const OPTIONS: RuntimeOptions = {
  pythonFiles: ['test_*.py', '*_test.py'],
  testpaths: [],
  django: false,
};
export const SERVICE = production('app.service');
const CLIENT = production('app.client');

export function productionAt(file: string): PythonModule {
  return { file, module: dotted(file), isPackage: file.endsWith('__init__.py') };
}

export function scanned(found: Readonly<Record<string, unknown>> = {}): Record<string, unknown> {
  return { strings: [], plugins: [], fixtures: [], requests: [], marks: [], ...found };
}

export function fixture(
  name: string,
  requests: readonly string[] = [],
  autouse = false,
): FixtureEntry {
  return { name, autouse, requests };
}

function testEntryOf(entry: unknown): TestEntry {
  return {
    test: textOf(fieldOf(entry, 'test')),
    category: textOf(fieldOf(entry, 'category')),
    directProductionModules: fieldOf(entry, 'directProductionModules'),
    runtimeProductionModules: fieldOf(entry, 'runtimeProductionModules'),
    subprocessBridges: fieldOf(entry, 'subprocessBridges'),
  };
}

export function analyze({
  others,
  modules = [SERVICE, CLIENT],
  imports = {},
  literals = {},
  runner = 'pytest',
  options,
}: AnalyzeRequest): TestRuntimeReport {
  const report: unknown = Reflect.apply(analyzePythonTestRuntime, undefined, [
    { modules, others, imports, literals, options: options ?? OPTIONS, runner },
  ]);
  return {
    findings: listOf(fieldOf(report, 'findings')).map(fieldsOf),
    tests: listOf(fieldOf(report, 'tests')).map(testEntryOf),
    exclusions: fieldOf(report, 'exclusions'),
    summary: fieldsOf(fieldOf(report, 'summary')),
  };
}

export function categories(report: TestRuntimeReport): Record<string, string> {
  return Object.fromEntries(report.tests.map(({ test, category }) => [test, category]));
}

export function messageOf(rule: string): string {
  const found = evaluate({ findings: [{ test: 'any.py', category: rule }] }, 'test-runtime').find(
    ({ classification }) => classification === 'enforceable',
  );
  return textOf(found?.['message']);
}
