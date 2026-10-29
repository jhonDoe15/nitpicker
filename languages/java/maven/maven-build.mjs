import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readEffectivePom } from './configuration/effective-pom.mjs';
import { runMaven } from './maven-command.mjs';
import {
  lifecycleArgs,
  moduleClasspaths,
  parseDependencyList,
  readReactor,
} from './maven-project.mjs';
import { missingLauncherVersions } from './maven-tests.mjs';
import { checkstyleIndentation } from '../adapters/style/java-style.mjs';
import {
  archunitTool,
  formatTool,
  jacocoPlugin,
  MAVEN_PLUGINS,
  resolveTools,
} from './maven-tools.mjs';
import { buildRunsArchRules } from './spring/arch-rules-gate.mjs';
import { writeSpringRoles } from '../adapters/spring-arch/spring-roles.mjs';
import { processorTool } from './errorprone/maven-errorprone.mjs';
import { readPinnedTools } from '../builds/java-build.mjs';
import { kotlinSetup } from './kotlin/kotlin-setup.mjs';
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

function dependencyFile(work, module) {
  const [groupId, artifactId] = module.coordinates.split(':');
  return path.join(work, 'dependencies', groupId, `${artifactId}.txt`);
}

function buildAndTest({ projectRoot, maven, work, pinned, modules, spawn }) {
  runMaven({
    projectRoot,
    maven,
    spawn,
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

function readModules({ projectRoot, maven, work, spawn }) {
  const effectivePom = readEffectivePom({ projectRoot, maven, work, spawn });
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

function analyzeAll({ analyzed, policy, kotlin, work, ...shared }) {
  const style = {
    javaStyle: policy.javaStyle,
    indentation: checkstyleIndentation(policy.conventions),
  };
  const springRoles = writeSpringRoles(policy.springRoles, work);
  return analyzed
    .map(({ module, classpaths }) =>
      analyzeModule({
        ...shared,
        module,
        classpaths,
        style,
        tolerateFailures: policy.snapshot === 'base',
        kotlinOptions: kotlin.options,
        spring: policy.spring,
        springRoles,
      }),
    )
    .filter((failure) => failure !== undefined);
}

function extraTools({ modules, analyzed, policy, pinned, kotlin }) {
  return [
    ...modules.map((module) => processorTool(module.compiler)).filter(Boolean),
    ...formatTool(policy.javaStyle, pinned),
    ...kotlin.extraTools,
    ...archunitTool(buildRunsArchRules(policy, analyzed), pinned),
  ];
}

export function runMavenPreset(
  projectRoot,
  { maven, policy = {}, configs, environment = {}, spawn },
) {
  const pinned = readPinnedTools();
  const work = mkdtempSync(path.join(tmpdir(), 'nitpicker-maven-'));
  const run = { projectRoot, maven, spawn, pinned };
  try {
    const { modules, effectivePom } = readModules({ ...run, work });
    const kotlin = kotlinSetup({ ...run, policy, modules, effectivePom, work, environment });
    const since = Date.now() - 2000;
    buildAndTest({ ...run, work, modules });
    const analyzed = modules.map((module) => ({
      module,
      classpaths: readClasspaths(work, module),
    }));
    const tools = resolveTools({
      ...run,
      launcherVersions: missingLauncherVersions(analyzed),
      extraTools: extraTools({ modules, analyzed, policy, pinned, kotlin }),
    });
    const testsFailures = analyzeAll({
      ...run,
      analyzed,
      tools,
      configs,
      since,
      policy,
      kotlin,
      work,
    });
    return {
      moduleDirs: modules.map((module) => module.basedir),
      testsFailures,
      formatAdvice: kotlin.options?.advice,
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
