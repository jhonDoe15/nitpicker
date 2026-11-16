import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { JAVA_FORMATTERS } from '../../adapters/style/jvm-formatters.mjs';
import { skipWithoutJdk, sourceLevel, toolJava } from '../errorprone/maven-jdk.mjs';
import { FORMAT_SKIPPED } from '../../adapters/reporting/skips/skipped-tools.mjs';
import { runJava } from '../maven-command.mjs';
import { JAVAC_EXPORTS, javaFiles } from '../maven-lint.mjs';
import { callUntyped } from '../../adapters/typed/java-values.mts';
import { fieldOf, textOf, textsOf } from '../../../../shared/values/readers.mts';
import { mavenModuleOf } from '../typed/maven-values.mts';

type FormatOptions = Readonly<Record<string, unknown>> & {
  readonly reportDir: string;
  readonly javaStyle?: string | undefined;
};

export function runFormat(options: FormatOptions): void {
  const module = mavenModuleOf(options['module']);
  const report = path.join(options.reportDir, 'format.txt');
  const roots = [...textsOf(module['sourceRoots']), ...textsOf(module['testSourceRoots'])];
  const files = textsOf(javaFiles(roots));
  const formatter: unknown = fieldOf(JAVA_FORMATTERS, options.javaStyle ?? 'google');
  if (files.length === 0 || formatter === undefined) {
    writeFileSync(report, '');
    return;
  }
  const placeholders = { 'format.txt': '' };
  callUntyped(
    skipWithoutJdk,
    { reportDir: options.reportDir, file: FORMAT_SKIPPED, placeholders },
    () => {
      const result = runFormatter(options, { formatter, files });
      writeFileSync(report, textOf(fieldOf(result, 'stdout')));
    },
  );
}

function runFormatter(
  options: FormatOptions,
  { formatter, files }: { readonly formatter: unknown; readonly files: readonly string[] },
): unknown {
  const module = mavenModuleOf(options['module']);
  const tool = fieldOf(formatter, 'tool');
  const flags = [...textsOf(fieldOf(formatter, 'flags')), ...textsOf(options['formatterFlags'])];
  return callUntyped(runJava, {
    java: callUntyped(toolJava, { tool, level: callUntyped(sourceLevel, module['compiler']) }),
    tool,
    classpath: fieldOf(options['tools'], textOf(fieldOf(formatter, 'classpath'))),
    jvmArgs: JAVAC_EXPORTS,
    mainClass: fieldOf(formatter, 'mainClass'),
    args: [...flags, '--dry-run', ...files],
    cwd: module.basedir,
    accept: (run: unknown) => fieldOf(run, 'status') === 0,
    spawn: options['spawn'],
    timeoutMs: options['timeoutMs'],
  });
}
