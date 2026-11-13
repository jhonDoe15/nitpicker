import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { isJavaModule } from '../../builds/lint/lint-arguments.mjs';
import { runJava } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';
import { errorProneJava } from './maven-jdk.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, fieldsOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { type MavenModule, mavenModuleOf } from '../typed/maven-values.mts';

type Compiler = Readonly<Record<string, unknown>> & {
  readonly compilerArgs: readonly string[];
  readonly processorPaths?: readonly string[] | undefined;
};
type Modular = boolean | 'all';
type SetOutputs = {
  readonly classes: string;
  readonly generated: string;
  readonly argumentFile: string;
};
type CompileSet = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly classpath: readonly string[];
  readonly compiled?: readonly string[];
  readonly own: readonly string[];
  readonly test: boolean;
  readonly modular: Modular;
  readonly outputs: SetOutputs;
};
type ArgumentSet = CompileSet & {
  readonly compiler: Compiler;
  readonly processors: readonly string[];
  readonly flags: readonly string[];
};
type ErrorProneContext = Readonly<Record<string, unknown>> & { readonly reportDir: string };

const RUNNER_DIRECTORY = path.join(GRADLE_DIRECTORY, 'errorprone');
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
const OWN_JARS = /^(?:error_prone_|nullaway-)/u;
const MODULE_INFO = 'module-info.java';
const PROCESSOR_KEY_LENGTH = 16;

function compilerOf(value: unknown): Compiler {
  const paths = fieldOf(value, 'processorPaths');
  return {
    ...fieldsOf(value),
    compilerArgs: textsOf(fieldOf(value, 'compilerArgs')),
    processorPaths: paths === undefined ? undefined : textsOf(paths),
  };
}

export function processorTool(
  settings: unknown,
): { name: string; coordinates: readonly string[] } | undefined {
  const { processorPaths } = compilerOf(settings);
  if (processorPaths === undefined || processorPaths.length === 0) {
    return undefined;
  }
  const key = createHash('sha256').update(processorPaths.join('\n')).digest('hex');
  return { name: `processors-${key.slice(0, PROCESSOR_KEY_LENGTH)}`, coordinates: processorPaths };
}

export function processorPath(
  classpath: readonly string[],
  settings: unknown,
  tools: unknown,
): string[] {
  const compiler = compilerOf(settings);
  if (compiler['proc'] === 'none') {
    return [];
  }
  const configured = processorTool(compiler);
  const found =
    compiler.processorPaths === undefined
      ? classpath
      : textsOf(fieldOf(tools, configured?.name ?? '') ?? []);
  return found.filter((entry) => !OWN_JARS.test(path.basename(entry)));
}

function levelLines(compiler: Compiler): string[] {
  const { release, source, target } = compiler;
  if (release !== undefined) {
    return [`--release=${textOf(release)}`];
  }
  return [
    ...(source === undefined ? [] : [`--source=${textOf(source)}`]),
    ...(target === undefined ? [] : [`--target=${textOf(target)}`]),
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

function setLines(set: ArgumentSet, classes: string, generated: string): string[] {
  const { own, processors, compiler, test, flags } = set;
  const encoding = compiler['encoding'];
  return [
    ...['-d', classes, '-s', generated, ...lookupLines(set)],
    ...['-processorpath', processors.join(path.delimiter)],
    ...['-XDcompilePolicy=simple', '-XDaddTypeAnnotationsToSymbol=true'],
    ...['--should-stop=ifError=FLOW', '-Xmaxwarns', '1000000', '-Xmaxerrs', '1000000'],
    `--own-classes=${own.join(path.delimiter)}`,
    ...compiler.compilerArgs.map((argument) => `--project-arg=${argument}`),
    ...levelLines(compiler),
    ...(encoding === undefined ? [] : ['-encoding', textOf(encoding)]),
    ...flags.map((flag) => `--errorprone-flag=${flag}`),
    ...(test ? ['--test-only'] : []),
  ];
}

function writeArguments(set: ArgumentSet): string[] {
  const sources = textsOf(javaFiles(set.roots)).filter(
    (file) => set.modular !== false || path.basename(file) !== MODULE_INFO,
  );
  if (sources.length === 0) {
    return [];
  }
  const { classes, generated, argumentFile } = set.outputs;
  mkdirSync(classes, { recursive: true });
  mkdirSync(generated, { recursive: true });
  const lines = [...setLines(set, classes, generated), '--sources', ...sources];
  writeFileSync(argumentFile, lines.map((line) => `${line}\n`).join(''), 'utf8');
  return [argumentFile];
}

function isModular(module: MavenModule): boolean {
  return textsOf(javaFiles(textsOf(module['sourceRoots']))).some(
    (file) => path.basename(file) === MODULE_INFO,
  );
}

function compileSets(
  module: MavenModule,
  classpaths: unknown,
  { modular, work }: { readonly modular: Modular; readonly work: string },
): CompileSet[] {
  const output = textOf(module['outputDirectory']);
  const testOutput = textOf(module['testOutputDirectory']);
  return [
    {
      name: 'main',
      roots: textsOf(module['sourceRoots']),
      classpath: [...textsOf(fieldOf(classpaths, 'mainCompile')), output],
      own: [output],
      test: false,
      modular,
      outputs: {
        classes: path.join(work, 'classes', 'main'),
        generated: path.join(work, 'generated', 'main'),
        argumentFile: path.join(work, 'main.args'),
      },
    },
    {
      name: 'test',
      roots: textsOf(module['testSourceRoots']),
      classpath: [output, ...textsOf(fieldOf(classpaths, 'testCompile'))],
      compiled: [testOutput],
      own: [output, testOutput],
      test: true,
      modular: false,
      outputs: {
        classes: path.join(work, 'classes', 'test'),
        generated: path.join(work, 'generated', 'test'),
        argumentFile: path.join(work, 'test.args'),
      },
    },
  ];
}

function argumentFiles(context: ErrorProneContext, work: string, modular: Modular): string[] {
  const module = mavenModuleOf(context['module']);
  const compiler = compilerOf(module['compiler']);
  const tools = context['tools'];
  const flags = textsOf(fieldOf(fieldOf(context['configs'], 'errorprone'), 'arguments'));
  return compileSets(module, context['classpaths'], { modular, work }).flatMap((set) =>
    writeArguments({
      ...set,
      compiler: set.test ? compilerOf({ ...compiler, ...fieldsOf(compiler['test']) }) : compiler,
      processors: [
        ...textsOf(fieldOf(tools, 'errorprone')),
        ...processorPath(set.classpath, compiler, tools),
      ],
      flags,
    }),
  );
}

function usesPreview(compiler: Compiler): boolean {
  const test = compiler['test'] === undefined ? compiler : compilerOf(compiler['test']);
  return [compiler, test].some((settings) => settings.compilerArgs.includes('--enable-preview'));
}

function analyze(context: ErrorProneContext, modular: Modular): void {
  const report = path.join(context.reportDir, 'errorprone.json');
  const work = path.join(context.reportDir, 'errorprone');
  rmSync(work, { recursive: true, force: true });
  const files = argumentFiles(context, work, modular);
  if (files.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  const module = mavenModuleOf(context['module']);
  const preview = usesPreview(compilerOf(module['compiler']));
  const spawn = context['spawn'];
  callUntyped(runJava, {
    java: callUntyped(errorProneJava, { preview, spawn }),
    spawn,
    timeoutMs: context['timeoutMs'],
    tool: 'Error Prone',
    jvmArgs: JVM_FLAGS,
    args: [
      path.join(RUNNER_DIRECTORY, 'ErrorProneReport.java'),
      report,
      path.join(RUNNER_DIRECTORY, 'checks.json'),
      ...files,
    ],
    cwd: module.basedir,
    accept: (result: unknown) => fieldOf(result, 'status') === 0 && existsSync(report),
  });
}

export function runErrorProne(context: ErrorProneContext): void {
  const modular = isModular(mavenModuleOf(context['module']));
  try {
    analyze(context, modular);
  } catch (error) {
    if (!modular) {
      throw error;
    }
    analyze(context, 'all');
  }
}
