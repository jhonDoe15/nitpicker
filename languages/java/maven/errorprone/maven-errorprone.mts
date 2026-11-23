import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mts';
import { isJavaModule } from '../../builds/lint/lint-arguments.mts';
import { javaFiles } from '../maven-lint.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { runJava } from '../programs/java-command.mts';
import { compiledProgram } from '../programs/helper-programs.mts';
import { fieldOf, numberOr, textsOf } from '../../../../shared/values/readers.mts';
import type { Classpaths } from '../typed/maven-values.mts';
import { type ToolClasspaths, resolvedTool } from '../typed/kotlin-types.mts';
import {
  type CompilePassSettings,
  type CompilerSettings,
  type SourceModule,
  compilerOf,
  passSettings,
} from './compiler-types.mts';
import { executionName, levelLines, matchingSources, usesPreview } from './maven-compiler.mts';
import { ERROR_PRONE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mts';
import { errorProneJava, isNoFittingJdk, skipWithoutJdk } from './maven-jdk.mts';
import { writeSkipReport } from './jdk-skip.mts';
import { processorFailureFor, processorTool } from '../processors/processor-tools.mts';
import { toolHeapFlags, toolSlots } from '../parallel/slots/tool-slots.mts';
import { analyzesGenerated, generatedRoots } from '../generated/generated-roots.mts';
import { mavenBudget } from '../../adapters/gradle-wrapper/gradle-budget.mts';
import { errorProneOnEngine, javaHomeOf } from '../../builds/errorprone/errorprone-engine.mts';
import { ENGINE_REPORT } from '../../builds/errorprone/engine-diagnostics.mts';

export { processorTool } from '../processors/processor-tools.mts';

type Modular = boolean | 'all';
type ErrorProneContext = {
  readonly module: SourceModule;
  readonly reportDir: string;
  readonly tools: ToolClasspaths;
  readonly processorFailures?: Readonly<Record<string, string>> | undefined;
  readonly classpaths: Classpaths;
  readonly configs: unknown;
  readonly spawn?: JavaSpawn | undefined;
  readonly timeoutMs?: number | undefined;
  readonly environment: JavaEnvironment;
};
type CompileSet = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly classpath: readonly string[];
  readonly compiled?: readonly string[];
  readonly own: readonly string[];
  readonly test: boolean;
  readonly modular: Modular;
  readonly compiler: CompilePassSettings;
};
type ArgumentSet = CompileSet & {
  readonly processors: readonly string[];
  readonly flags: readonly string[];
  readonly skipRoots: readonly string[] | undefined;
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
const MODULE_INFO = 'module-info.java';

function declaredProcessors(
  configured: { readonly name: string } | undefined,
  tools: ToolClasspaths,
): readonly string[] {
  return configured === undefined ? [] : (tools[configured.name] ?? []);
}

export function processorPath(
  classpath: readonly string[],
  compiler: Pick<CompilerSettings, 'processorPaths' | 'proc'>,
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
  const { name, roots, own, processors, compiler, test, modular, flags, skipRoots } = set;
  const sources = matchingSources(roots, compiler).filter(
    (file) => modular !== false || path.basename(file) !== MODULE_INFO,
  );
  if (sources.length === 0) {
    return [];
  }
  const setModular = sources.some((file) => path.basename(file) === MODULE_INFO) ? modular : false;
  const classes = path.join(work, 'classes', name);
  const generated = path.join(work, 'generated', name);
  mkdirSync(classes, { recursive: true });
  mkdirSync(generated, { recursive: true });
  const lines = [
    ...['-d', classes, '-s', generated, ...lookupLines({ ...set, modular: setModular })],
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
    ...(test ? ['--test-only'] : []),
    '--sources',
    ...sources,
  ];
  const file = path.join(work, `${name}.args`);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''), 'utf8');
  return [file];
}

function isModular(module: SourceModule): boolean {
  return javaFiles(module.sourceRoots).some((file) => path.basename(file) === MODULE_INFO);
}

function compileSets(
  { module, classpaths }: Pick<ErrorProneContext, 'module' | 'classpaths'>,
  compiler: CompilerSettings,
  modular: Modular,
): CompileSet[] {
  const mainBase = {
    roots: module.sourceRoots,
    classpath: [...classpaths.mainCompile, module.outputDirectory],
    own: [module.outputDirectory],
    test: false,
    modular,
  };
  const testBase = {
    roots: module.testSourceRoots,
    classpath: [module.outputDirectory, ...classpaths.testCompile],
    compiled: [module.testOutputDirectory],
    own: [module.outputDirectory, module.testOutputDirectory],
    test: true,
    modular: false as const,
  };
  const extras = (compiler.executions ?? []).map((execution, index) => ({
    ...(execution.test ? testBase : mainBase),
    name: executionName(execution, index),
    compiler: passSettings(compiler, execution),
  }));
  return [
    { ...mainBase, name: 'main', compiler: passSettings(compiler, compiler) },
    ...extras.filter((set) => !set.test),
    { ...testBase, name: 'test', compiler: passSettings(compiler, compiler.test ?? compiler) },
    ...extras.filter((set) => set.test),
  ];
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

export function compileArgumentFiles(
  context: Pick<ErrorProneContext, 'module' | 'tools' | 'classpaths' | 'configs'>,
  work: string,
  modular: Modular,
): string[] {
  const compiler = compilerOf(context.module.compiler);
  const flags = textsOf(fieldOf(fieldOf(context.configs, ERROR_PRONE), 'arguments'));
  return compileSets(context, compiler, modular).flatMap((set) =>
    writeArguments(work, {
      ...set,
      processors: [
        ...resolvedTool(context.tools, ERROR_PRONE),
        ...processorPath(set.classpath, set.compiler, context.tools),
      ],
      flags,
      skipRoots: analyzesGenerated(context.configs)
        ? undefined
        : generatedRoots(context.module, set.roots),
    }),
  );
}

function analyze(context: ErrorProneContext, modular: Modular): void {
  const { module, reportDir, spawn, timeoutMs, environment } = context;
  const report = path.join(reportDir, 'errorprone.json');
  const work = path.join(reportDir, ERROR_PRONE);
  rmSync(work, { recursive: true, force: true });
  rmSync(path.join(reportDir, ENGINE_REPORT), { force: true });
  const argumentFiles = compileArgumentFiles(context, work, modular);
  if (argumentFiles.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  const java = errorProneJava({
    preview: usesPreview(compilerOf(module.compiler)),
    spawn,
    environment,
  });
  errorProneOnEngine({ reportDir, argumentFiles, javaHome: javaHomeOf(java) }, environment);
  runReport({ module, spawn, timeoutMs }, java, { report, argumentFiles });
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
  const modular = isModular(context.module);
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
  const skip = {
    reportDir: context.reportDir,
    file: ERROR_PRONE_SKIPPED,
    placeholders: { 'errorprone.json': '[]\n' },
  };
  const failure = processorFailureFor(
    compilerOf(context.module.compiler),
    context.processorFailures,
  );
  if (failure !== undefined) {
    writeSkipReport(skip, failure);
    return;
  }
  skipWithoutJdk(skip, () => {
    analyzeWithFallback(context);
  });
}
