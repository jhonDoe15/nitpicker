import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ARCHITECTURE_TEST,
  architectureArguments,
  architectureExcludes,
  coveragePatterns,
  describeArguments,
  testArguments,
  withCoverageAgent,
} from './maven-build.mjs';
import { createDeadline, createMavenRunner, mavenTarget } from './maven-command.mjs';
import { javaHomeFrom } from './context/java-home.mjs';
import { moduleContext } from './context/module-context.mjs';
import { pinnedVersionMap } from './context/pinned-versions.mjs';
import { toolConfigChoices } from './context/tool-config.mjs';
import { readEffectivePom, selectModules } from './module-facts.mjs';
import { MODULE_STEPS } from './steps/index.mjs';
import { resolveToolSet } from './tools/tool-cache.mjs';
import { TOOL_DEPENDENCIES, launcherDependencies } from './tools/tool-set.mjs';

const BUILD_BUDGET_MS = 15 * 60 * 1000;
const RULESET_DIRECTORY = path.resolve(import.meta.dirname, '../gradle');
const PINNED_SOURCE = path.join(RULESET_DIRECTORY, 'nitpicker.init.gradle');

function hasArchitectureTests(module) {
  return (
    existsSync(module.testClassesDirectory) &&
    readdirSync(module.testClassesDirectory, { recursive: true }).some((name) =>
      ARCHITECTURE_TEST.test(path.basename(name)),
    )
  );
}

function readJavaHome(projectRoot, configured, deadline) {
  const target = mavenTarget({ projectRoot, configured, args: ['-v'] });
  const result = spawnSync(target.command, target.args, {
    cwd: projectRoot,
    encoding: 'utf8',
    shell: target.shell,
    timeout: deadline.remaining(),
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  return javaHomeFrom(result.stdout);
}

function openSession(projectRoot, { maven, reportBase }) {
  const deadline = createDeadline(BUILD_BUDGET_MS);
  const scratch = path.join(reportBase, 'maven');
  mkdirSync(scratch, { recursive: true });
  return {
    projectRoot,
    maven,
    reportBase,
    scratch,
    deadline,
    runMaven: createMavenRunner({ projectRoot, configured: maven, deadline }),
  };
}

function describeModules(session) {
  const effectivePom = path.join(session.scratch, 'effective-pom.xml');
  session.runMaven(describeArguments(effectivePom), { label: 'Maven compile' });
  return selectModules(readEffectivePom(effectivePom), session.projectRoot);
}

function createToolkit(session) {
  const versions = pinnedVersionMap(PINNED_SOURCE);
  function resolve(dependencies) {
    return resolveToolSet({
      dependencies,
      versions,
      runMaven: (args) => session.runMaven(args, { label: 'Maven tool resolution' }),
    });
  }
  return {
    versions,
    tools: resolve(TOOL_DEPENDENCIES),
    launcherClasspath: (version) =>
      resolve(launcherDependencies(version)).classpath('junit-launcher'),
  };
}

function runTests(session, modules, tools) {
  const excludes = path.join(session.scratch, 'architecture-excludes.txt');
  writeFileSync(excludes, architectureExcludes());
  const classesDirectories = modules.map((module) => module.classesDirectory);
  const env = withCoverageAgent(process.env, {
    agentJar: tools.classpath('jacoco-agent')[0],
    patterns: coveragePatterns(classesDirectories.filter((directory) => existsSync(directory))),
  });
  session.runMaven(testArguments(excludes), { env, label: 'Maven test run' });
  const architecture = modules.some(hasArchitectureTests);
  if (architecture) {
    session.runMaven(architectureArguments(), { label: 'Maven architecture test run' });
  }
  return architecture;
}

function analyzeModules(shared, modules) {
  for (const module of modules) {
    const context = moduleContext(shared, module);
    mkdirSync(context.reportRoot, { recursive: true });
    for (const step of MODULE_STEPS) {
      step(context);
    }
  }
}

function writeModuleIndex(reportBase, modules) {
  const index = modules.map(({ key, path: modulePath, dir }) => ({ key, path: modulePath, dir }));
  writeFileSync(path.join(reportBase, 'modules.json'), JSON.stringify(index));
}

export function runMavenPreset(projectRoot, options) {
  if (options.policy?.preset === 'kotlin') {
    throw new Error('The kotlin preset needs a Gradle build; this project builds with Maven');
  }
  const session = openSession(projectRoot, options);
  const modules = describeModules(session);
  const { versions, tools, launcherClasspath } = createToolkit(session);
  const architecture = runTests(session, modules, tools);
  analyzeModules(
    {
      projectRoot,
      reportBase: options.reportBase,
      deadline: session.deadline,
      tools,
      versions,
      architecture,
      launcherClasspath,
      toolConfig: toolConfigChoices(projectRoot, options.policy ?? {}),
      rulesetDirectory: RULESET_DIRECTORY,
      javaHome: readJavaHome(projectRoot, options.maven, session.deadline),
    },
    modules,
  );
  writeModuleIndex(options.reportBase, modules);
}
