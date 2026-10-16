import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { javaCommand, runJava, runMaven } from './maven-command.mjs';
import { runCheckstyle, runFormat, runPmd, runSpotbugs } from './maven-lint.mjs';
import {
  lifecycleArgs,
  moduleClasspaths,
  parseDependencyList,
  readReactor,
} from './maven-project.mjs';
import {
  archunitMatcher,
  collectTestResults,
  junitLauncherVersion,
  runJacocoReport,
  runPit,
} from './maven-tests.mjs';
import { copyTestResults } from './results/maven-test-results.mjs';
import { jacocoPlugin, MAVEN_PLUGINS, resolveTools } from './maven-tools.mjs';
import { GRADLE_DIRECTORY, readPinnedTools } from '../builds/java-build.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;
const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
];

function relativeTo(basedir, file) {
  return path.relative(basedir, file).replaceAll('\\', '/');
}

function readEffectivePom(projectRoot, maven, work) {
  const output = path.join(work, 'effective-pom.xml');
  runMaven({
    projectRoot,
    maven,
    args: ['--quiet', `${MAVEN_PLUGINS.help}:effective-pom`, `-Doutput=${output}`],
  });
  return readFileSync(output, 'utf8');
}

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function buildAndTest({ projectRoot, maven, work, pinned, modules }) {
  runMaven({
    projectRoot,
    maven,
    args: [
      '--quiet',
      `${jacocoPlugin(pinned)}:prepare-agent`,
      `-Djacoco.destFile=\${project.build.directory}/${OWN_JACOCO_EXEC}`,
      ...lifecycleArgs(modules),
      `${MAVEN_PLUGINS.dependency}:list`,
      `-DoutputFile=${path.join(work, 'dependencies', '${project.groupId}', '${project.artifactId}.txt')}`,
      '-DoutputAbsoluteArtifactFilename=true',
      '-DappendOutput=false',
      '-Dmaven.test.failure.ignore=true',
      '-DskipTests=false',
      '-Dmaven.test.skip=false',
      ...PROJECT_CHECKS_OFF,
    ],
  });
}

function runStructure(module, reportDir) {
  const roots = module.sourceRoots
    .filter((root) => existsSync(root))
    .map((root) => relativeTo(module.basedir, root));
  runJava({
    tool: 'StructureMetrics',
    args: [
      path.join(GRADLE_DIRECTORY, 'StructureMetrics.java'),
      path.join(reportDir, 'structure.json'),
      module.basedir,
      ...roots,
    ],
    cwd: module.basedir,
    accept: (result) => result.status === 0,
  });
}

function runJdeps(module, reportDir) {
  const classes = existsSync(module.outputDirectory)
    ? readdirSync(module.outputDirectory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.class'))
        .filter((entry) => !['module-info.class', 'package-info.class'].includes(entry.name))
        .map((entry) =>
          relativeTo(module.outputDirectory, path.join(entry.parentPath, entry.name))
            .replace(/\.class$/u, '')
            .replaceAll('/', '.'),
        )
        .sort()
    : [];
  writeFileSync(
    path.join(reportDir, 'jdeps-classes.txt'),
    classes.map((name) => `${name}\n`).join(''),
  );
  if (classes.length === 0) {
    writeFileSync(path.join(reportDir, 'jdeps.txt'), '');
    return;
  }
  const result = spawnSync(
    javaCommand('jdeps'),
    ['-verbose:class', '-filter:none', module.outputDirectory],
    {
      cwd: module.basedir,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `jdeps failed with exit code ${String(result.status)}: ${result.error?.message ?? result.stderr}`,
    );
  }
  writeFileSync(path.join(reportDir, 'jdeps.txt'), result.stdout);
}

function relativeRoots(module, roots) {
  return roots.map((root) => relativeTo(module.basedir, root));
}

function writeManifest({ module, reportDir, pinned, spring }) {
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({
      versions: pinned,
      build: 'maven',
      sourceRoots: relativeRoots(module, module.sourceRoots),
      testSourceRoots: relativeRoots(module, module.testSourceRoots),
      resourceRoots: relativeRoots(module, module.resourceRoots),
      spring,
    }),
  );
}

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
}

function analyzeModule({ module, classpaths, tools, pinned, configs, since }) {
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const spring = classpaths.mainCompile.some((entry) => SPRING_JAR.test(path.basename(entry)));
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  copyTestResults({ module, reportDir, since, isArchunit });
  runPmd({ module, reportDir, tools, classpaths, configs, spring });
  runSpotbugs({ module, reportDir, tools });
  runFormat({ module, reportDir, tools });
  runCheckstyle({ module, reportDir, tools, configs, pinned });
  runStructure(module, reportDir);
  runJdeps(module, reportDir);
  const execFiles = [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
  runJacocoReport({ module, reportDir, tools, execFiles, since, testsRan });
  runPit({ module, reportDir, tools, classpaths, isArchunit });
  writeManifest({ module, reportDir, pinned, spring });
}

function staleOutputs(module) {
  const execFiles = [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
  return [
    path.join(module.basedir, MAVEN_REPORT_DIRECTORY),
    ...execFiles.filter((file) => file.startsWith(`${module.buildDirectory}${path.sep}`)),
  ];
}

function readModules(projectRoot, maven, work) {
  const modules = readReactor(projectRoot, readEffectivePom(projectRoot, maven, work)).filter(
    (module) => module.packaging !== 'pom',
  );
  if (modules.length === 0) {
    throw new Error(
      `No Maven module under ${projectRoot} builds Java classes: every module has packaging pom`,
    );
  }
  for (const file of modules.flatMap(staleOutputs)) {
    rmSync(file, { recursive: true, force: true });
  }
  for (const module of modules) {
    mkdirSync(path.join(module.basedir, MAVEN_REPORT_DIRECTORY), { recursive: true });
  }
  return modules;
}

function missingLauncherVersions(analyzed) {
  const versions = analyzed.map(({ classpaths }) => junitLauncherVersion(classpaths.testRuntime));
  return [...new Set(versions.filter((version) => version !== undefined))];
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs }) {
  if (policy.preset === 'kotlin') {
    throw new Error(
      'The kotlin preset needs a Gradle build, and this project builds with Maven. Use the java preset for its Java sources',
    );
  }
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const modules = readModules(projectRoot, maven, work);
    const since = Date.now() - 2000;
    buildAndTest({ projectRoot, maven, work, pinned, modules });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveTools({
      projectRoot,
      maven,
      pinned,
      launcherVersions: missingLauncherVersions(analyzed),
    });
    for (const { module, classpaths } of analyzed) {
      analyzeModule({ module, classpaths, tools, pinned, configs, since });
    }
    return modules.map((module) => module.basedir);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
