import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { isJavaModule } from '../../builds/lint/lint-arguments.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { javaFiles } from '../maven-lint.mts';
import { runJava } from '../programs/java-command.mts';
import { compiledProgram } from '../programs/helper-programs.mts';
import { fieldOf, numberOr, textsOf } from '../../../../shared/values/readers.mts';
import type { Classpaths } from '../typed/maven-values.mts';
import { type ToolClasspaths, resolvedTool } from '../typed/kotlin-types.mts';
import {
  type CompilerSettings,
  type SourceModule,
  compilerOf,
} from '../compile-sets/compiler-types.mts';
import {
  type CompileSet,
  type Modular,
  compileSets,
  isModular,
} from '../compile-sets/compile-sets.mts';
import { ERROR_PRONE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mts';
import { errorProneJava, isNoFittingJdk, skipWithoutJdk } from './maven-jdk.mts';
import { toolHeapFlags, toolSlots } from '../parallel/slots/tool-slots.mts';
import { analyzesGenerated, generatedRoots } from '../generated/generated-roots.mts';
import { mavenBudget } from '../../adapters/gradle-wrapper/gradle-budget.mts';
import {
  argumentFilesToCompile,
  errorProneOnEngine,
  javaHomeOf,
} from '../../builds/errorprone/errorprone-engine.mts';
import { ENGINE_REPORT } from '../../builds/errorprone/engine-diagnostics.mts';

type ErrorProneContext = {
  readonly module: SourceModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly classpaths: Classpaths;
  readonly configs: unknown;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment: JavaEnvironment;
};
type ArgumentSet = CompileSet & {
  readonly processors: readonly string[];
  readonly flags: readonly string[];
  readonly skipRoots: readonly string[] | undefined;
  readonly processorOutput: string;
};

const ERROR_PRONE = 'errorprone';
const ERROR_PRONE_TOOL = 'Error Prone';
const RUNNER_DIRECTORY = path.join(GRADLE_DIRECTORY, ERROR_PRONE);
const COMPILER_PACKAGES = [
  ...['api', 'file', 'main', 'model', 'parser'],
  ...['processing', 'tree', 'util', 'code', 'comp'],
];
const JVM_FLAGS = [
  ...COMPILER_PACKAGES.map(
    (name) => `--add-exports=jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
  ),
  ...['code', 'comp'].map(
    (name) => `--add-opens=jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
  ),
];
const ERROR_PRONE_SHARES = 2;
const DEADLINE_MARGIN_MS = 30_000;
const OWN_JARS = /^(?:error_prone_|nullaway-)/u;

export function processorTool(
  compiler: Pick<CompilerSettings, 'processorPaths' | 'processorRepositories'>,
):
  | {
      readonly name: string;
      readonly coordinates: string[];
      readonly repositories?: string[];
    }
  | undefined {
  if (compiler.processorPaths === undefined || compiler.processorPaths.length === 0) {
    return undefined;
  }
  const repositories = compiler.processorRepositories ?? [];
  const key = createHash('sha256')
    .update([...compiler.processorPaths, ...repositories].join('\n'))
    .digest('hex');
  return {
    name: `processors-${key.slice(0, 16)}`,
    coordinates: compiler.processorPaths,
    ...(repositories.length === 0 ? {} : { repositories }),
  };
}

function declaredProcessors(
  configured: { readonly name: string } | undefined,
  tools: ToolClasspaths,
): readonly string[] {
  return configured === undefined ? [] : (tools[configured.name] ?? []);
}

export function processorPath(
  classpath: readonly string[],
  compiler: Pick<CompilerSettings, 'processorPaths' | 'processorRepositories' | 'proc'>,
  tools: ToolClasspaths,
): readonly string[] {
  if (compiler.proc === 'none') {
    return [];
  }
  const configured = processorTool(compiler);
  const found =
    compiler.processorPaths === undefined ? classpath : declaredProcessors(configured, tools);
  return found.filter((entry) => !OWN_JARS.test(path.basename(entry)));
}

function levelLines(compiler: CompilerSettings): string[] {
  if (compiler.release !== undefined) {
    return [`--release=${compiler.release}`];
  }
  return [
    ...(compiler.source === undefined ? [] : [`--source=${compiler.source}`]),
    ...(compiler.target === undefined ? [] : [`--target=${compiler.target}`]),
  ];
}

function lookupLines({ classpath: sourcePath, compiled = [], own, modular }: CompileSet): string[] {
  const classpath = [...sourcePath, ...compiled];
  const libraries = classpath.filter((entry) => !own.includes(entry) && existsSync(entry));
  const modules =
    modular === false ? [] : libraries.filter((entry) => modular === 'all' || isJavaModule(entry));
  const plain = classpath.filter((entry) => !modules.includes(entry));
  return [
    ...(modules.length === 0 ? [] : ['--module-path', modules.join(path.delimiter)]),
    ...['-classpath', plain.join(path.delimiter)],
  ];
}

function writeArguments(work: string, set: ArgumentSet): string[] {
  const { name, sources, own, processors, compiler, test, flags, skipRoots, processorOutput } = set;
  if (sources.length === 0) {
    return [];
  }
  const classes = path.join(work, 'classes', name);
  const generated = path.join(work, 'generated', name);
  mkdirSync(classes, { recursive: true });
  mkdirSync(generated, { recursive: true });
  const lines = [
    ...['-d', classes, '-s', generated, ...lookupLines(set)],
    ...['-processorpath', processors.join(path.delimiter)],
    ...['-XDcompilePolicy=simple', '-XDaddTypeAnnotationsToSymbol=true'],
    ...['--should-stop=ifError=FLOW', '-Xmaxwarns', '1000000', '-Xmaxerrs', '1000000'],
    `--own-classes=${own.join(path.delimiter)}`,
    ...compiler.compilerArgs.map((argument) => `--project-arg=${argument}`),
    ...levelLines(compiler),
    ...(compiler.encoding === undefined ? [] : ['-encoding', compiler.encoding]),
    ...flags.map((flag) => `--errorprone-flag=${flag}`),
    ...(skipRoots === undefined
      ? []
      : ['--skip-generated', ...skipRoots.map((root) => `--generated-root=${root}`)]),
    `--processor-output=${processorOutput}`,
    ...(test ? ['--test-only'] : []),
    '--sources',
    ...sources,
  ];
  const file = path.join(work, `${name}.args`);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''), 'utf8');
  return [file];
}

function usesPreview(compiler: CompilerSettings): boolean {
  return [compiler, compiler.test ?? compiler].some((settings) =>
    settings.compilerArgs.includes('--enable-preview'),
  );
}

export function runnerFlags(
  timeoutMs: number = numberOr(fieldOf(mavenBudget(), 'commandTimeoutMs'), 0),
  { slots = toolSlots(), now = Date.now() } = {},
): string[] {
  const pool = [
    `-Dnitpicker.errorprone.workers=${String(slots)}`,
    ...toolHeapFlags(Math.max(1, slots / ERROR_PRONE_SHARES)),
  ];
  return Number.isFinite(timeoutMs) && timeoutMs > DEADLINE_MARGIN_MS
    ? [...pool, `-Dnitpicker.errorprone.deadline=${String(now + timeoutMs - DEADLINE_MARGIN_MS)}`]
    : pool;
}

export function processorOutput(
  module: Pick<SourceModule, 'basedir' | 'outputDirectory'>,
  compiler: Pick<CompilerSettings, 'generatedSources' | 'test'>,
  test: boolean,
): string {
  const configured = test ? compiler.test?.generatedSources : compiler.generatedSources;
  return configured === undefined
    ? path.join(
        path.dirname(module.outputDirectory),
        test ? 'generated-test-sources/test-annotations' : 'generated-sources/annotations',
      )
    : path.resolve(module.basedir, configured);
}

function argumentFilesOf(
  { module, reportDir, tools, classpaths, configs }: ErrorProneContext,
  compiler: CompilerSettings,
  modular: Modular,
): string[] {
  const work = path.join(reportDir, ERROR_PRONE);
  rmSync(work, { recursive: true, force: true });
  const declaredFlags = textsOf(fieldOf(fieldOf(configs, ERROR_PRONE), 'arguments'));
  const files = { main: javaFiles(module.sourceRoots), test: javaFiles(module.testSourceRoots) };
  return compileSets({ module, classpaths, files }, compiler, modular).flatMap((set) =>
    writeArguments(work, {
      ...set,
      processors: [
        ...resolvedTool(tools, ERROR_PRONE),
        ...processorPath(set.classpath, compiler, tools),
      ],
      flags: declaredFlags,
      skipRoots: analyzesGenerated(configs) ? undefined : generatedRoots(module, set.roots),
      processorOutput: processorOutput(module, compiler, set.test),
    }),
  );
}

function analyze(context: ErrorProneContext, modular: Modular): void {
  const { module, reportDir, spawn, timeoutMs, environment } = context;
  const report = path.join(reportDir, 'errorprone.json');
  const compiler = compilerOf(module.compiler);
  const argumentFiles = argumentFilesOf(context, compiler, modular);
  rmSync(path.join(reportDir, ENGINE_REPORT), { force: true });
  if (argumentFiles.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  const java = errorProneJava({ preview: usesPreview(compiler), spawn, environment });
  errorProneOnEngine({ reportDir, argumentFiles, javaHome: javaHomeOf(java) }, environment);
  const compiled = argumentFilesToCompile(argumentFiles);
  if (compiled.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  runReport({ module, spawn, timeoutMs }, java, { report, argumentFiles: compiled });
}

function runReport(
  { module, spawn, timeoutMs }: Pick<ErrorProneContext, 'module' | 'spawn' | 'timeoutMs'>,
  java: string,
  { report, argumentFiles }: { readonly report: string; readonly argumentFiles: readonly string[] },
): void {
  const classes = compiledProgram({
    tool: ERROR_PRONE_TOOL,
    name: 'errorprone-report',
    sources: [path.join(RUNNER_DIRECTORY, 'ErrorProneReport.java')],
    version: '1',
    libraries: [],
    cwd: module.basedir,
    spawn,
    timeoutMs,
    java,
  });
  runJava({
    java,
    spawn,
    timeoutMs,
    tool: ERROR_PRONE_TOOL,
    classpath: [classes],
    mainClass: 'ErrorProneReport',
    jvmArgs: [...JVM_FLAGS, ...runnerFlags(timeoutMs)],
    args: [report, path.join(RUNNER_DIRECTORY, 'checks.json'), ...argumentFiles],
    cwd: module.basedir,
    accept: (result) => result.status === 0 && existsSync(report),
  });
}

function analyzeWithFallback(context: ErrorProneContext): void {
  const modular = isModular(javaFiles(context.module.sourceRoots));
  try {
    analyze(context, modular);
  } catch (error) {
    if (!modular || isNoFittingJdk(error)) {
      throw error;
    }
    analyze(context, 'all');
  }
}

export function runErrorProne(context: ErrorProneContext): void {
  skipWithoutJdk(
    {
      reportDir: context.reportDir,
      file: ERROR_PRONE_SKIPPED,
      placeholders: { 'errorprone.json': '[]\n' },
    },
    () => {
      analyzeWithFallback(context);
    },
  );
}
