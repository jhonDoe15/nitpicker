import { readdirSync } from 'node:fs';
import path from 'node:path';
import { DEPENDENCY_PLUGIN, HELP_PLUGIN } from './tools/tool-set.mjs';

export const COMPILE_CLASSPATH = 'target/nitpicker/classpath-compile.txt';
export const TEST_CLASSPATH = 'target/nitpicker/classpath-test.txt';
export const COVERAGE_DATA = 'target/nitpicker/jacoco.exec';
export const ARCHITECTURE_TEST = /(?:ArchTest|ArchitectureTest)\.class$/u;
const ARCHITECTURE_PATTERNS = ['*ArchTest', '*ArchitectureTest'];

const NEVER_SKIP = ['-DskipTests=false', '-Dmaven.test.skip=false'];
const OWN_COVERAGE = '-Djacoco.skip=true';
const NO_EMPTY_FAILURE = ['-DfailIfNoTests=false', '-Dsurefire.failIfNoSpecifiedTests=false'];

function classpathGoal(file, scope) {
  return [
    `${DEPENDENCY_PLUGIN}:build-classpath`,
    `-Dmdep.outputFile=${file}`,
    `-DincludeScope=${scope}`,
  ];
}

export function describeArguments(effectivePomFile) {
  return [
    'test-compile',
    `${HELP_PLUGIN}:effective-pom`,
    `-Doutput=${effectivePomFile}`,
    ...classpathGoal(COMPILE_CLASSPATH, 'compile'),
  ];
}

export function testArguments(excludesFile) {
  return [
    'test',
    ...classpathGoal(TEST_CLASSPATH, 'test'),
    ...NEVER_SKIP,
    OWN_COVERAGE,
    ...NO_EMPTY_FAILURE,
    `-Dsurefire.excludesFile=${excludesFile}`,
  ];
}

export function architectureArguments() {
  return [
    'test',
    `-Dtest=${ARCHITECTURE_PATTERNS.join(',')}`,
    ...NEVER_SKIP,
    OWN_COVERAGE,
    ...NO_EMPTY_FAILURE,
    '-Dmaven.test.failure.ignore=true',
  ];
}

export function architectureExcludes() {
  return ARCHITECTURE_PATTERNS.map((pattern) => `**/${pattern}.java`).join('\n');
}

function packagesIn(directory) {
  return [
    ...new Set(
      readdirSync(directory, { recursive: true })
        .filter((name) => name.endsWith('.class'))
        .map((name) => path.dirname(name).split(path.sep).join('.')),
    ),
  ];
}

export function coveragePatterns(classesDirectories) {
  const packages = classesDirectories.flatMap(packagesIn).sort();
  if (packages.includes('.')) {
    return ['*'];
  }
  return packages
    .filter((name) => !packages.some((other) => name.startsWith(`${other}.`)))
    .map((name) => `${name}.*`);
}

export function withCoverageAgent(env, { agentJar, patterns }) {
  if (patterns.length === 0) {
    return env;
  }
  const option = `-javaagent:${agentJar}=destfile=${COVERAGE_DATA},includes=${patterns.join(':')}`;
  const quoted = /\s/u.test(option) ? `"${option}"` : option;
  return {
    ...env,
    JAVA_TOOL_OPTIONS: [env.JAVA_TOOL_OPTIONS, quoted].filter(Boolean).join(' '),
  };
}
