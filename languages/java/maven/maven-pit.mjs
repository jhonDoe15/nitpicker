import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runJava } from './maven-command.mjs';
import { nitpickerPitArguments } from '../adapters/tool-config/declared/pit-declared.mjs';
import { classFiles, pitClasspath, pitTargets, pitTests } from './maven-tests.mjs';

export function javaArgumentFile(args) {
  return args
    .map((argument) => {
      const escaped = argument
        .replaceAll('\\', '\\\\')
        .replaceAll('"', '\\"')
        .replaceAll('\n', '\\n')
        .replaceAll('\r', '\\r');
      return `"${escaped}"\n`;
    })
    .join('');
}

function pitArgLine(pitDir, args) {
  if (args.length === 0) {
    return [];
  }
  const file = path.join(pitDir, 'jvm-arguments');
  writeFileSync(file, javaArgumentFile(args));
  const quote = file.includes('"') ? "'" : '"';
  return ['--argLine', `${quote}@${file}${quote}`];
}

function pitArguments({ module, pitDir, classpaths, isArchunit, configs }) {
  return [
    '--reportDir',
    pitDir,
    '--targetClasses',
    pitTargets(module.outputDirectory).join(','),
    '--targetTests',
    pitTests(module.testOutputDirectory, isArchunit).join(','),
    '--sourceDirs',
    module.sourceRoots.filter((root) => existsSync(root)).join(','),
    '--classPath',
    [...new Set(classpaths.testRuntime)].filter((entry) => existsSync(entry)).join(','),
    '--mutableCodePaths',
    module.outputDirectory,
    '--outputFormats',
    'XML',
    '--timestampedReports',
    'false',
    ...(configs?.pit?.arguments ?? nitpickerPitArguments()),
    '--failWhenNoMutations',
    'false',
    '--verbose',
    'false',
    ...pitArgLine(pitDir, module.testJvmArgs),
  ];
}

export function runPit({
  module,
  reportDir,
  tools,
  classpaths,
  isArchunit,
  configs,
  spawn,
  timeoutMs,
}) {
  const pitDir = path.join(reportDir, 'pit');
  rmSync(pitDir, { recursive: true, force: true });
  mkdirSync(pitDir, { recursive: true });
  const report = path.join(pitDir, 'mutations.xml');
  if (classFiles(module.outputDirectory).length === 0) {
    return;
  }
  runJava({
    tool: 'PIT',
    classpath: pitClasspath(tools, classpaths.testRuntime),
    mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
    args: pitArguments({ module, pitDir, classpaths, isArchunit, configs }),
    cwd: module.basedir,
    accept: (result) => result.status === 0,
    spawn,
    timeoutMs,
  });
  if (!existsSync(report)) {
    writeFileSync(report, '<mutations/>');
  }
}
