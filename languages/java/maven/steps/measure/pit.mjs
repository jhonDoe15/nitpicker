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

export function mutationTargets(classesDirectory) {
  return readdirSync(classesDirectory, { withFileTypes: true })
    .map((entry) => {
      if (entry.isDirectory()) {
        return `${entry.name}.*`;
      }
      return entry.name.endsWith('.class') ? entry.name.replace(/\.class$/u, '') : undefined;
    })
    .filter((name) => name !== undefined);
}

export function testClassNames(testClassesDirectory) {
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

export function junitEngineVersion(testClasspath) {
  const names = testClasspath.map((entry) => path.basename(entry));
  const engine = names.map((name) => ENGINE_JAR.exec(name)?.[1]).find(Boolean);
  const launcher = names.some((name) => LAUNCHER_JAR.test(name));
  return { engine, launcher };
}

function hasClasses(directory) {
  return existsSync(directory) && readdirSync(directory).length > 0;
}

export function runPit(context) {
  const { module, reportRoot, tools, classpaths } = context;
  const output = path.join(reportRoot, 'pit');
  if (!hasClasses(module.classesDirectory)) {
    return;
  }
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const { engine, launcher } = junitEngineVersion(classpaths.test);
  const toolClasspath = [
    ...tools.classpath('pit'),
    ...(engine === undefined ? [] : tools.classpath('pit-junit5')),
    ...(engine === undefined || launcher ? [] : context.launcherClasspath(engine)),
  ];
  const projectClasspath = [
    module.testClassesDirectory,
    module.classesDirectory,
    ...classpaths.test,
  ].filter((entry) => existsSync(entry));
  const tests = existsSync(module.testClassesDirectory)
    ? testClassNames(module.testClassesDirectory)
    : [];
  runJavaTool(context, {
    label: 'PIT',
    okExit: [0],
    classpath: [...new Set(toolClasspath)],
    mainClass: 'org.pitest.mutationtest.commandline.MutationCoverageReport',
    args: [
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
    ],
  });
  if (!existsSync(path.join(output, 'mutations.xml'))) {
    writeFileSync(path.join(output, 'mutations.xml'), EMPTY_MUTATIONS);
  }
}
