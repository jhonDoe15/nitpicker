import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { JAVA_FORMATTERS } from '../../adapters/style/jvm-formatters.mjs';
import { toolJava } from '../errorprone/maven-jdk.mjs';
import { runJava } from '../maven-command.mjs';
import { JAVAC_EXPORTS, javaFiles } from '../maven-lint.mjs';

export function runFormat({ module, reportDir, tools, javaStyle = 'google', spawn, timeoutMs }) {
  const report = path.join(reportDir, 'format.txt');
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  const formatter = JAVA_FORMATTERS[javaStyle];
  if (files.length === 0 || formatter === undefined) {
    writeFileSync(report, '');
    return;
  }
  const result = runJava({
    java: toolJava({ tool: formatter.tool }),
    tool: formatter.tool,
    classpath: tools[formatter.classpath],
    jvmArgs: JAVAC_EXPORTS,
    mainClass: formatter.mainClass,
    args: [...formatter.flags, '--dry-run', ...files],
    cwd: module.basedir,
    accept: ({ status }) => status === 0,
    spawn,
    timeoutMs,
  });
  writeFileSync(report, result.stdout);
}
