import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../maven-command.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { kotlinFiles, lintedRoots, relativeRoots } from './kotlin-files.mjs';

const PSI_DIRECTORY = path.join(GRADLE_DIRECTORY, 'kotlin-psi');
const PSI_MAIN_CLASS = 'nitpicker.kotlinpsi.KotlinPsi';
const COMPILED_MARKER = '.compiled';
const TEST_PREFIX = 'test:';
const EMPTY_METRICS = '{"functions":[],"files":[]}';
const EMPTY_FACTS = '{"files":[]}';

function succeeded(result) {
  return result.status === 0;
}

export function programArguments({ program, output, module }) {
  return [
    path.join(GRADLE_DIRECTORY, program),
    output,
    module.basedir,
    ...relativeRoots(module, module.kotlin.sourceRoots),
  ];
}

export function psiArguments({ metrics, facts, module }) {
  return [
    metrics,
    facts,
    module.basedir,
    ...relativeRoots(module, module.kotlin.sourceRoots),
    ...relativeRoots(module, module.kotlin.testSourceRoots).map((root) => `${TEST_PREFIX}${root}`),
  ];
}

function psiSources() {
  return readdirSync(PSI_DIRECTORY, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function compilerOptions(pinned) {
  return ['-Djava.awt.headless=true', `-Dnitpicker.kotlinCompiler=${pinned.kotlinCompiler}`];
}

function compilePsi({ classes, tools }) {
  const marker = path.join(classes, COMPILED_MARKER);
  if (!existsSync(marker)) {
    mkdirSync(classes, { recursive: true });
    runJava({
      java: javaCommand('javac'),
      tool: 'javac',
      classpath: tools['kotlin-compiler'],
      args: ['-proc:none', '-d', classes, ...psiSources()],
      cwd: classes,
      accept: succeeded,
    });
    writeFileSync(marker, '');
  }
}

export function runKotlinPsi({ module, reportDir, tools, pinned, classes }) {
  const metrics = path.join(reportDir, 'kotlin-metrics.json');
  const facts = path.join(reportDir, 'kotlin-facts.json');
  if (kotlinFiles(lintedRoots(module.kotlin)).length === 0) {
    writeFileSync(metrics, EMPTY_METRICS);
    writeFileSync(facts, EMPTY_FACTS);
    return;
  }
  compilePsi({ classes, tools });
  runJava({
    tool: 'KotlinPsi',
    classpath: [...tools['kotlin-compiler'], classes],
    mainClass: PSI_MAIN_CLASS,
    jvmArgs: compilerOptions(pinned),
    args: psiArguments({ metrics, facts, module }),
    cwd: module.basedir,
    accept: succeeded,
  });
}

export function runKotlinSyntax({ module, reportDir, tools, pinned }) {
  if (kotlinFiles(module.kotlin.sourceRoots).length > 0) {
    runJava({
      tool: 'KotlinSyntax.java',
      classpath: tools['kotlin-compiler'],
      jvmArgs: compilerOptions(pinned),
      args: programArguments({
        program: 'KotlinSyntax.java',
        output: path.join(reportDir, 'kotlin-syntax.json'),
        module,
      }),
      cwd: module.basedir,
      accept: succeeded,
    });
  }
}
