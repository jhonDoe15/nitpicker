import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from '../../maven-command.mjs';
import { GRADLE_DIRECTORY } from '../../../builds/java-build.mjs';
import { kotlinFiles, relativeTo } from './kotlin-files.mjs';

const EMPTY_METRICS = '{"functions":[],"files":[]}';

export function programArguments({ program, output, module }) {
  return [
    path.join(GRADLE_DIRECTORY, program),
    output,
    module.basedir,
    ...module.kotlin.sourceRoots.map((root) => relativeTo(module.basedir, root)),
  ];
}

function runKotlinProgram({ program, output, module, tools, pinned }) {
  runJava({
    tool: program,
    classpath: tools['kotlin-compiler'],
    jvmArgs: ['-Djava.awt.headless=true', `-Dnitpicker.kotlinCompiler=${pinned.kotlinCompiler}`],
    args: programArguments({ program, output, module }),
    cwd: module.basedir,
    accept: (result) => result.status === 0,
  });
}

export function runKotlinMetrics({ module, reportDir, tools, pinned }) {
  const output = path.join(reportDir, 'kotlin-metrics.json');
  if (kotlinFiles(module.kotlin.sourceRoots).length === 0) {
    writeFileSync(output, EMPTY_METRICS);
    return;
  }
  runKotlinProgram({ program: 'KotlinMetrics.java', output, module, tools, pinned });
}

export function runKotlinSyntax({ module, reportDir, tools, pinned }) {
  if (kotlinFiles(module.kotlin.sourceRoots).length > 0) {
    runKotlinProgram({
      program: 'KotlinSyntax.java',
      output: path.join(reportDir, 'kotlin-syntax.json'),
      module,
      tools,
      pinned,
    });
  }
}
