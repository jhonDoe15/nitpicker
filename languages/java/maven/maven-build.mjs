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
import { processorTool, runErrorProne } from './errorprone/maven-errorprone.mjs';
import { GRADLE_DIRECTORY, readPinnedTools } from '../builds/java-build.mjs';
import { analyzeKotlinModule } from './kotlin/kotlin-module.mjs';
import { kotlinSetup } from './kotlin/kotlin-options.mjs';
import { relativeTo } from './kotlin/tools/kotlin-files.mjs';

export const MAVEN_REPORT_DIRECTORY = 'target/nitpicker';
const OWN_JACOCO_EXEC = 'nitpicker-jacoco.exec';
const SPRING_JAR = /^spring-(?:context|boot)-.*\.jar$/u;
const GUAVA_JAR = /^guava-\d.*\.jar$/u;
const PROJECT_CHECKS_OFF = [
  '-Dcheckstyle.skip=true',
  '-Dpmd.skip=true',
  '-Dcpd.skip=true',
  '-Dspotbugs.skip=true',
  '-Dspotless.check.skip=true',
  '-Dktlint.skip=true',
  '-Ddetekt.skip=true',
];

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
      path.join(reportDir, 'classes.json'),
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

function hasGuava(classpath) {
  return classpath.some((entry) => GUAVA_JAR.test(path.basename(entry)));
}

function writeManifest({ module, reportDir, pinned, spring, classpaths, kotlinManifest }) {
  writeFileSync(
    path.join(reportDir, 'manifest.json'),
    JSON.stringify({
      versions: pinned,
      build: 'maven',
      sourceRoots: relativeRoots(module, module.sourceRoots),
      testSourceRoots: relativeRoots(module, module.testSourceRoots),
      resourceRoots: relativeRoots(module, module.resourceRoots),
      spring,
      guava: hasGuava(classpaths.mainCompile),
      testGuava: hasGuava(classpaths.testCompile),
      ...kotlinManifest,
    }),
  );
}

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
}

function runSourceTools({ module, reportDir, tools, classpaths, configs, pinned, kotlin }) {
  runPmd({ module, reportDir, tools, classpaths, configs, spring: kotlin.spring });
  runSpotbugs({
    module: kotlin.spotbugsModule,
    reportDir,
    tools,
    auxClasspath: kotlin.auxClasspath,
  });
  runErrorProne({ module, reportDir, tools, classpaths });
  runFormat({ module, reportDir, tools, javaStyle: kotlin.javaStyle });
  runCheckstyle({ module, reportDir, tools, configs, pinned });
}

function analyzeModule({
  module,
  classpaths,
  tools,
  pinned,
  configs,
  since,
  kotlinOptions,
  javaStyle,
}) {
  const reportDir = path.join(module.basedir, MAVEN_REPORT_DIRECTORY);
  const isArchunit = archunitMatcher(module.archunitIncludes);
  const spring = classpaths.mainCompile.some((entry) => SPRING_JAR.test(path.basename(entry)));
  const testsRan = collectTestResults({ module, reportDir, since, isArchunit });
  copyTestResults({ module, reportDir, since, isArchunit });
  const kotlin = analyzeKotlinModule({
    module,
    reportDir,
    tools,
    classpaths,
    pinned,
    options: kotlinOptions,
    spring,
  });
  runSourceTools({
    module,
    reportDir,
    tools,
    classpaths,
    configs,
    pinned,
    kotlin: { ...kotlin, spring, javaStyle },
  });
  runStructure(module, reportDir);
  runJdeps(module, reportDir);
  runJacocoReport({
    module: kotlin.coverageModule,
    reportDir,
    tools,
    execFiles: jacocoExecFiles(module),
    since,
    testsRan,
  });
  runPit({ module: kotlin.coverageModule, reportDir, tools, classpaths, isArchunit });
  writeManifest({ module, reportDir, pinned, spring, classpaths, kotlinManifest: kotlin.manifest });
}

function jacocoExecFiles(module) {
  return [path.join(module.buildDirectory, OWN_JACOCO_EXEC), ...module.jacocoDestFiles];
}

function staleOutputs(module) {
  return [
    path.join(module.basedir, MAVEN_REPORT_DIRECTORY),
    ...jacocoExecFiles(module).filter((file) =>
      file.startsWith(`${module.buildDirectory}${path.sep}`),
    ),
  ];
}

function readModules(projectRoot, maven, work) {
  const effectivePom = readEffectivePom(projectRoot, maven, work);
  const modules = readReactor(projectRoot, effectivePom).filter(
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
  return { modules, effectivePom };
}

function missingLauncherVersions(analyzed) {
  const versions = analyzed.map(({ classpaths }) => junitLauncherVersion(classpaths.testRuntime));
  return [...new Set(versions.filter((version) => version !== undefined))];
}

export function runMavenPreset(projectRoot, { maven, policy = {}, configs }) {
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  try {
    const { modules, effectivePom } = readModules(projectRoot, maven, work);
    const kotlin = kotlinSetup({ projectRoot, policy, modules, effectivePom, work, pinned });
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
      extraTools: [
        ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
        ...kotlin.extraTools,
      ],
    });
    for (const { module, classpaths } of analyzed) {
      analyzeModule({
        module,
        classpaths,
        tools,
        pinned,
        configs,
        since,
        kotlinOptions: kotlin.options,
        javaStyle: policy.javaStyle,
      });
    }
    return modules.map((module) => module.basedir);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
