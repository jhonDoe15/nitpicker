import { readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJavaTool } from '../java-tool.mjs';

const EXPORTED_PACKAGES = ['api', 'file', 'parser', 'tree', 'util', 'code'];
const ARGUMENT_FILE_THRESHOLD = 20000;
const FORMATTER_FAILURE = 1;

function javaFiles(roots) {
  return roots
    .flatMap((root) =>
      readdirSync(root, { recursive: true })
        .filter((name) => name.endsWith('.java'))
        .map((name) => path.join(root, name)),
    )
    .sort();
}

export function runFormat(context) {
  const { module, reportRoot, tools } = context;
  const files = javaFiles([...module.sourceRoots, ...module.testSourceRoots]);
  const listed = ['--dry-run', ...files];
  const argumentFile = path.join(reportRoot, 'format-arguments.txt');
  const long = listed.join(' ').length > ARGUMENT_FILE_THRESHOLD;
  if (long) {
    writeFileSync(argumentFile, listed.join('\n'));
  }
  runJavaTool(context, {
    label: 'google-java-format',
    jvmArgs: EXPORTED_PACKAGES.map(
      (name) => `--add-exports=jdk.compiler/com.sun.tools.javac.${name}=ALL-UNNAMED`,
    ),
    classpath: tools.classpath('format'),
    mainClass: 'com.google.googlejavaformat.java.Main',
    okExit: [0, FORMATTER_FAILURE],
    args: long ? [`@${argumentFile}`] : listed,
    stdoutFile: path.join(reportRoot, 'format.txt'),
  });
}
