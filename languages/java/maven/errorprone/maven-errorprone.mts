import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { isJavaModule } from '../../builds/lint/lint-arguments.mjs';
import { javaFiles } from '../maven-lint.mts';
import type { JavaEnvironment, JavaSpawn } from '../../adapters/typed/java-values.mts';
import { runJava } from '../programs/java-command.mts';
import { fieldOf, textsOf } from '../../../../shared/values/readers.mts';
import type { Classpaths } from '../typed/maven-values.mts';
import { type ToolClasspaths, resolvedTool } from '../typed/kotlin-types.mts';
import { type CompilerSettings, type SourceModule, compilerOf } from './compiler-types.mts';
import { ERROR_PRONE_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mjs';
import { errorProneJava, isNoFittingJdk, skipWithoutJdk } from './maven-jdk.mts';
import { toolHeapFlags, toolSlots } from '../parallel/tool-slots.mts';

type Modular = boolean | 'all';
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
type CompileSet = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly classpath: readonly string[];
  readonly compiled?: readonly string[];
  readonly own: readonly string[];
  readonly test: boolean;
  readonly modular: Modular;
};
type ArgumentSet = CompileSet & {
  readonly processors: readonly string[];
  readonly compiler: CompilerSettings;
  readonly flags: readonly string[];
};

const ERROR_PRONE = 'errorprone';
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
const OWN_JARS = /^(?:error_prone_|nullaway-)/u;
const MODULE_INFO = 'module-info.java';

export function processorTool(compiler: Pick<CompilerSettings, 'processorPaths'>):
  | {
      readonly name: string;
      readonly coordinates: string[];
    }
  | undefined {
  if (compiler.processorPaths === undefined || compiler.processorPaths.length === 0) {
    return undefined;
  }
  const key = createHash('sha256').update(compiler.processorPaths.join('\n')).digest('hex');
  return { name: `processors-${key.slice(0, 16)}`, coordinates: compiler.processorPaths };
}

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
  const { name, roots, own, processors, compiler, test, modular, flags } = set;
  const sources = javaFiles(roots).filter(
    (file) => modular !== false || path.basename(file) !== MODULE_INFO,
  );
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
  modular: Modular,
): CompileSet[] {
  return [
    {
      name: 'main',
      roots: module.sourceRoots,
      classpath: [...classpaths.mainCompile, module.outputDirectory],
      own: [module.outputDirectory],
      test: false,
      modular,
    },
    {
      name: 'test',
      roots: module.testSourceRoots,
      classpath: [module.outputDirectory, ...classpaths.testCompile],
      compiled: [module.testOutputDirectory],
      own: [module.outputDirectory, module.testOutputDirectory],
      test: true,
      modular: false,
    },
  ];
}

function usesPreview(compiler: CompilerSettings): boolean {
  return [compiler, compiler.test ?? compiler].some((settings) =>
    settings.compilerArgs.includes('--enable-preview'),
  );
}

export function runnerFlags(slots: number = toolSlots()): string[] {
  return [
    `-Dnitpicker.errorprone.workers=${String(slots)}`,
    ...toolHeapFlags(Math.max(1, slots / ERROR_PRONE_SHARES)),
  ];
}

function analyze(
  {
    module,
    reportDir,
    tools,
    classpaths,
    configs,
    spawn,
    timeoutMs,
    environment,
  }: ErrorProneContext,
  modular: Modular,
): void {
  const report = path.join(reportDir, 'errorprone.json');
  const work = path.join(reportDir, ERROR_PRONE);
  rmSync(work, { recursive: true, force: true });
  const compiler = compilerOf(module.compiler);
  const argumentFiles = compileSets({ module, classpaths }, modular).flatMap((set) =>
    writeArguments(work, {
      ...set,
      compiler: set.test ? { ...compiler, ...compiler.test } : compiler,
      processors: [
        ...resolvedTool(tools, ERROR_PRONE),
        ...processorPath(set.classpath, compiler, tools),
      ],
      flags: textsOf(fieldOf(fieldOf(configs, ERROR_PRONE), 'arguments')),
    }),
  );
  if (argumentFiles.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  runJava({
    java: errorProneJava({ preview: usesPreview(compiler), spawn, environment }),
    spawn,
    timeoutMs,
    tool: 'Error Prone',
    jvmArgs: [...JVM_FLAGS, ...runnerFlags()],
    args: [
      path.join(RUNNER_DIRECTORY, 'ErrorProneReport.java'),
      report,
      path.join(RUNNER_DIRECTORY, 'checks.json'),
      ...argumentFiles,
    ],
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
