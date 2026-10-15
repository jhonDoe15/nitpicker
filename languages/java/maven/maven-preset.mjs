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

export function runMavenPreset(projectRoot, { maven, policy = {}, reportBase }) {
  if (policy.preset === 'kotlin') {
    throw new Error('The kotlin preset needs a Gradle build; this project builds with Maven');
  }
  const deadline = createDeadline(BUILD_BUDGET_MS);
  const runMaven = createMavenRunner({ projectRoot, configured: maven, deadline });
  const scratch = path.join(reportBase, 'maven');
  mkdirSync(scratch, { recursive: true });
  const effectivePom = path.join(scratch, 'effective-pom.xml');
  runMaven(describeArguments(effectivePom), { label: 'Maven compile' });
  const modules = selectModules(readEffectivePom(effectivePom), projectRoot);
  const versions = pinnedVersionMap(PINNED_SOURCE);
  const resolve = (dependencies) =>
    resolveToolSet({
      dependencies,
      versions,
      runMaven: (args) => runMaven(args, { label: 'Maven tool resolution' }),
    });
  const tools = resolve(TOOL_DEPENDENCIES);
  const excludes = path.join(scratch, 'architecture-excludes.txt');
  writeFileSync(excludes, architectureExcludes());
  const env = withCoverageAgent(process.env, {
    agentJar: tools.classpath('jacoco-agent')[0],
    patterns: coveragePatterns(
      modules.map((module) => module.classesDirectory).filter((directory) => existsSync(directory)),
    ),
  });
  runMaven(testArguments(excludes), { env, label: 'Maven test run' });
  const architecture = modules.some(hasArchitectureTests);
  if (architecture) {
    runMaven(architectureArguments(), { label: 'Maven architecture test run' });
  }
  const shared = {
    projectRoot,
    reportBase,
    deadline,
    tools,
    versions,
    architecture,
    toolConfig: toolConfigChoices(projectRoot, policy),
    rulesetDirectory: RULESET_DIRECTORY,
    javaHome: readJavaHome(projectRoot, maven, deadline),
    launcherClasspath: (version) =>
      resolve(launcherDependencies(version)).classpath('junit-launcher'),
  };
  for (const module of modules) {
    const context = moduleContext(shared, module);
    mkdirSync(context.reportRoot, { recursive: true });
    MODULE_STEPS.forEach((step) => step(context));
  }
  writeFileSync(
    path.join(reportBase, 'modules.json'),
    JSON.stringify(
      modules.map(({ key, path: modulePath, dir }) => ({ key, path: modulePath, dir })),
    ),
  );
}
