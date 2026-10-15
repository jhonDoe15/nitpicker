import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GRADLE_DIRECTORY } from '../../builds/java-build.mjs';
import { runJava } from '../maven-command.mjs';
import { javaFiles } from '../maven-lint.mjs';

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

function writeArguments(work, { name, roots, classpath, processors, compiler, test }) {
  const sources = javaFiles(roots).filter((file) => path.basename(file) !== 'module-info.java');
  if (sources.length === 0) {
    return [];
  }
  const classes = path.join(work, 'classes', name);
  const generated = path.join(work, 'generated', name);
  mkdirSync(classes, { recursive: true });
  mkdirSync(generated, { recursive: true });
  const lines = [
    ...['-d', classes, '-s', generated, '-classpath', classpath.join(path.delimiter)],
    ...['-processorpath', processors.join(path.delimiter)],
    ...['-XDcompilePolicy=simple', '-XDaddTypeAnnotationsToSymbol=true'],
    ...['--should-stop=ifError=FLOW', '-Xmaxwarns', '1000000', '-Xmaxerrs', '1000000'],
    ...compiler.compilerArgs.map((argument) => `--project-arg=${argument}`),
    ...(compiler.release === undefined ? [] : [`--target-release=${compiler.release}`]),
    ...(compiler.encoding === undefined ? [] : ['-encoding', compiler.encoding]),
    ...(test ? ['--test-only'] : []),
    '--sources',
    ...sources,
  ];
  const file = path.join(work, `${name}.args`);
  writeFileSync(file, lines.map((line) => `${line}\n`).join(''));
  return [file];
}

export function runErrorProne({ module, reportDir, tools, classpaths }) {
  const report = path.join(reportDir, 'errorprone.json');
  const work = path.join(reportDir, 'errorprone');
  rmSync(work, { recursive: true, force: true });
  const { compiler } = module;
  const testClasspath = [module.outputDirectory, ...classpaths.testCompile];
  const sets = [
    { name: 'main', roots: module.sourceRoots, classpath: classpaths.mainCompile, test: false },
    { name: 'test', roots: module.testSourceRoots, classpath: testClasspath, test: true },
  ];
  const argumentFiles = sets.flatMap((set) =>
    writeArguments(work, {
      ...set,
      compiler,
      processors: [...tools.errorprone, ...processorPath(set.classpath, compiler, tools)],
    }),
  );
  if (argumentFiles.length === 0) {
    writeFileSync(report, '[]\n');
    return;
  }
  runJava({
    tool: 'Error Prone',
    jvmArgs: JVM_FLAGS,
    args: [
      path.join(RUNNER_DIRECTORY, 'ErrorProneReport.java'),
      report,
      path.join(RUNNER_DIRECTORY, 'checks.json'),
      module.outputDirectory,
      ...argumentFiles,
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0 && existsSync(report),
  });
}
