import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ARCHITECTURE_TEST } from '../../maven-build.mjs';
import { runJavaTool } from '../java-tool.mjs';

const ENGINE_JAR = /^junit-platform-engine-(.+)\.jar$/u;
const LAUNCHER_JAR = /^junit-platform-launcher-/u;
const EMPTY_MUTATIONS = '<mutations/>';

function slash(file) {
  return file.split(path.sep).join('/');
}

function mutationTargets(classesDirectory) {
  return readdirSync(classesDirectory, { withFileTypes: true })
    .map((entry) => {
      if (entry.isDirectory()) {
        return `${entry.name}.*`;
      }
      return entry.name.endsWith('.class') ? entry.name.replace(/\.class$/u, '') : undefined;
    })
    .filter((name) => name !== undefined);
}

function testClassNames(testClassesDirectory) {
  const names = readdirSync(testClassesDirectory, { recursive: true })
    .map(slash)
    .filter((name) => name.endsWith('.class') && !ARCHITECTURE_TEST.test(path.basename(name)))
    .map((name) =>
      name
        .replace(/\.class$/u, '')
        .replaceAll('/', '.')
        .replace(/\$.*$/u, ''),
    );
  return [...new Set(names)];
}

function junitEngineVersion(testClasspath) {
  const names = testClasspath.map((entry) => path.basename(entry));
  const engine = names.map((name) => ENGINE_JAR.exec(name)?.[1]).find(Boolean);
  const launcher = names.some((name) => LAUNCHER_JAR.test(name));
  return { engine, launcher };
}

function hasClasses(directory) {
  return existsSync(directory) && readdirSync(directory).length > 0;
}

function pitToolClasspath(context) {
  const { tools, classpaths } = context;
  const { engine, launcher } = junitEngineVersion(classpaths.test);
  return [
    ...new Set([
      ...tools.classpath('pit'),
      ...(engine === undefined ? [] : tools.classpath('pit-junit5')),
      ...(engine === undefined || launcher ? [] : context.launcherClasspath(engine)),
    ]),
  ];
}

function pitArguments({ module, classpaths }, output) {
  const projectClasspath = [
    module.testClassesDirectory,
    module.classesDirectory,
    ...classpaths.test,
  ].filter((entry) => existsSync(entry));
  const tests = existsSync(module.testClassesDirectory)
    ? testClassNames(module.testClassesDirectory)
    : [];
  return [
    '--reportDir',
    output,
    '--targetClasses',
    mutationTargets(module.classesDirectory).join(','),
    '--targetTests',
    tests.join(','),
    '--sourceDirs',
    module.sourceRoots.join(','),
    '--classPath',
    [...new Set(projectClasspath)].join(','),
    '--mutableCodePaths',
    module.classesDirectory,
    '--outputFormats',
    'XML',
    '--timestampedReports',
    'false',
    '--threads',
    '2',
    '--failWhenNoMutations',
    'false',
    '--verbose',
    'false',
  ];
}

export function runPit(context) {
  const output = path.join(context.reportRoot, 'pit');
  if (!hasClasses(context.module.classesDirectory)) {
    return;
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  runJavaTool(context, {
    label: 'PIT',
    okExit: [0],
    classpath: pitToolClasspath(context),
    mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
    args: pitArguments(context, output),
  });
  if (!existsSync(path.join(output, 'mutations.xml'))) {
    writeFileSync(path.join(output, 'mutations.xml'), EMPTY_MUTATIONS);
  }
}
