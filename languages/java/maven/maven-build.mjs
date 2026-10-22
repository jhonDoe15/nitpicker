import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runMaven } from './maven-command.mjs';
import {
  lifecycleArgs,
  moduleClasspaths,
  parseDependencyList,
  readReactor,
  usesSpring,
} from './maven-project.mjs';
import { junitLauncherVersion } from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import {
  archunitTool,
  formatTool,
  jacocoPlugin,
  MAVEN_PLUGINS,
  resolveTools,
} from './maven-tools.mjs';
import { processorTool } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { kotlinSetup } from './kotlin/kotlin-options.mjs';
import {
  analyzeModule,
  jacocoExecFiles,
  MAVEN_REPORT_DIRECTORY,
  OWN_JACOCO_EXEC,
} from './module/maven-module.mjs';

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

function readClasspaths(work, module) {
  return moduleClasspaths(
    module,
    parseDependencyList(readFileSync(dependencyFile(work, module), 'utf8')),
  );
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
        ...formatTool(policy.javaStyle, pinned),
        ...kotlin.extraTools,
        ...archunitTool(
          analyzed.some(({ classpaths }) => usesSpring(classpaths)),
          pinned,
        ),
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
        style: {
          javaStyle: policy.javaStyle,
          indentation: checkstyleIndentation(policy.conventions),
        },
        kotlinOptions: kotlin.options,
        spring: policy.spring,
      });
    }
    return {
      moduleDirs: modules.map((module) => module.basedir),
      formatAdvice: kotlin.options?.advice,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
