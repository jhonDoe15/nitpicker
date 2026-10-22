import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { javaCommand, runJava } from '../../maven-command.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { kotlinFiles, lintedRoots } from './kotlin-files.mjs';
import { relativeRoots } from '../../module/module-paths.mjs';

const PSI_DIRECTORY = path.join(GRADLE_DIRECTORY, 'kotlin-psi');
const PSI_MAIN_CLASS = 'nitpicker.kotlinpsi.KotlinPsi';
const COMPILED_MARKER = '.compiled';
const TEST_PREFIX = 'test:';
const EMPTY_METRICS = '{"functions":[],"files":[]}';
const EMPTY_FILES = '{"files":[]}';

function succeeded(result) {
  return result.status === 0;
}

export function psiArguments({ metrics, facts, syntax, module }) {
  return [
    metrics,
    facts,
    syntax,
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
  const syntax = path.join(reportDir, 'kotlin-syntax.json');
  if (kotlinFiles(lintedRoots(module.kotlin)).length === 0) {
    writeFileSync(metrics, EMPTY_METRICS);
    writeFileSync(facts, EMPTY_FILES);
    writeFileSync(syntax, EMPTY_FILES);
    return;
  }
  compilePsi({ classes, tools });
  runJava({
    tool: 'KotlinPsi',
    classpath: [...tools['kotlin-compiler'], classes],
    mainClass: PSI_MAIN_CLASS,
    jvmArgs: compilerOptions(pinned),
    args: psiArguments({ metrics, facts, syntax, module }),
    cwd: module.basedir,
    accept: succeeded,
  });
}
