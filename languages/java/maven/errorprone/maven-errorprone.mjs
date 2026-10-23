import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { isJavaModule } from '../../builds/lint/lint-arguments.mjs';
import { runJava } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';
import { ERROR_PRONE, toolJava } from './maven-jdk.mjs';
import { ERROR_PRONE_SKIPPED } from '../../adapters/reporting/outcomes/skipped-tools.mjs';

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

export function processorTool(compiler) {
  if (compiler.processorPaths === undefined || compiler.processorPaths.length === 0) {
    return undefined;
  }
  const key = createHash('sha256').update(compiler.processorPaths.join('\n')).digest('hex');
  return { name: `processors-${key.slice(0, 16)}`, coordinates: compiler.processorPaths };
}

function processorPath(classpath, compiler, tools) {
  if (compiler.proc === 'none') {
    return [];
  }
  const configured = processorTool(compiler);
  const found = compiler.processorPaths === undefined ? classpath : (tools[configured?.name] ?? []);
  return found.filter((entry) => !OWN_JARS.test(path.basename(entry)));
}

function levelLines(compiler) {
  if (compiler.release !== undefined) {
    return [`--release=${compiler.release}`];
  }
  return [
    ...(compiler.source === undefined ? [] : [`--source=${compiler.source}`]),
    ...(compiler.target === undefined ? [] : [`--target=${compiler.target}`]),
  ];
}

function lookupLines({ classpath, own, modular }) {
  const libraries = classpath.filter((entry) => !own.includes(entry));
  const modules =
    modular === false ? [] : libraries.filter((entry) => modular === 'all' || isJavaModule(entry));
  const plain = classpath.filter((entry) => !modules.includes(entry));
  return [
    ...(modules.length === 0 ? [] : ['--module-path', modules.join(path.delimiter)]),
    ...['-classpath', plain.join(path.delimiter)],
  ];
}

function writeArguments(work, set) {
  const { name, roots, own, processors, compiler, test, modular } = set;
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
    ...compiler.args.map((argument) => `--project-arg=${argument}`),
    ...levelLines(compiler),
    ...(compiler.encoding === undefined ? [] : ['-encoding', compiler.encoding]),
    ...(test ? ['--test-only'] : []),
    '--sources',
    ...sources,
  ];
  const file = path.join(work, `${name}.args`);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''), 'utf8');
  return [file];
}

function isModular(module) {
  return javaFiles(module.sourceRoots).some((file) => path.basename(file) === MODULE_INFO);
}

function compileSets({ module, classpaths }, modular) {
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
      own: [module.outputDirectory, module.testOutputDirectory],
      test: true,
      modular: false,
    },
  ];
}

function errorProneJdk(compiler, spawn) {
  const preview = [compiler, compiler.test ?? compiler].some((settings) =>
    settings.args.includes('--enable-preview'),
  );
  return toolJava({ ...ERROR_PRONE, preview, spawn });
}

function analyze({ module, reportDir, tools, classpaths, spawn }, modular) {
  const report = path.join(reportDir, 'errorprone.json');
  const work = path.join(reportDir, 'errorprone');
  const skipped = path.join(reportDir, ERROR_PRONE_SKIPPED);
  rmSync(work, { recursive: true, force: true });
  rmSync(skipped, { force: true });
  const { compiler } = module;
  const argumentFiles = compileSets({ module, classpaths }, modular).flatMap((set) =>
    writeArguments(work, {
      ...set,
      compiler: set.test ? { ...compiler, ...compiler.test } : compiler,
      processors: [...tools.errorprone, ...processorPath(set.classpath, compiler, tools)],
    }),
  );
  const { java, problem } = argumentFiles.length === 0 ? {} : errorProneJdk(compiler, spawn);
  if (argumentFiles.length === 0 || problem !== undefined) {
    writeFileSync(report, '[]\n');
    if (problem !== undefined) {
      writeFileSync(skipped, `${problem}\n`);
    }
    return;
  }
  runJava({
    java,
    spawn,
    tool: 'Error Prone',
    jvmArgs: JVM_FLAGS,
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

export function runErrorProne(context) {
  const modular = isModular(context.module);
  try {
    analyze(context, modular);
  } catch (error) {
    if (!modular) {
      throw error;
    }
    analyze(context, 'all');
  }
}
