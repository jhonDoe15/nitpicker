import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from '../../../core/tooling/jscpd/run-jscpd.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import { DOC_COMMENT_TOOL } from './doc-comments/doc-comment-findings.mjs';
import { INIT_SCRIPT, readPinnedTools } from '../builds/java-build.mjs';
import { importClosure } from '../../../shared/import-closure.mjs';
import { javaExecutionBudget } from './java-runner.mjs';
import { COMPILE_ERROR_TOOL } from '../../../shared/rules/finding-helpers.mjs';
import { javaCommand } from '../maven/maven-command.mjs';
import { JVM_NOISE } from '../../../shared/messages/jvm/jvm-noise.mjs';
import { mutationScopeArguments } from '../../../core/tooling/runner-arguments.mjs';
import { HEAD_TESTS_TOOL } from './red-base/tests-failed.mjs';
import { changedTestsKey } from '../builds/change-scope/tested-sources.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const runnerPath = path.join(import.meta.dirname, 'java-runner.mjs');
const ENTRY_FILES = [
  'languages/java/adapters/java-analyzer.mjs',
  'languages/java/adapters/java-runner.mjs',
];
const ARCHUNIT_DIRECTORY = 'languages/java/gradle/archunit';
const KOTLIN_PSI_DIRECTORY = 'languages/java/gradle/kotlin-psi';
const DESIGN_DIRECTORY = 'languages/java/gradle/design';
const RESOURCE_FILES = [
  'languages/java/adapters/gradle-wrapper/gradle-supervisor.mjs',
  'languages/java/gradle/nitpicker.init.gradle',
  'languages/java/gradle/checkstyle-suppressions.xml',
  'languages/java/gradle/checkstyle-suppressions-unformatted.xml',
  'languages/java/gradle/pmd-ruleset.xml',
  'languages/java/gradle/pmd-main-ruleset.xml',
  'languages/java/gradle/spring-ruleset.xml',
  'languages/java/gradle/reactor-ruleset.xml',
  'languages/java/gradle/rules/checkstyle-all.xml',
  'languages/java/gradle/rules/checkstyle-main.xml',
  'languages/java/gradle/rules/forbidden-apis.txt',
  'languages/java/gradle/rules/guards-ruleset.xml',
  'languages/java/gradle/rules/test-honesty-ruleset.xml',
  'languages/java/gradle/tasks/cpd-task.gradle',
  'languages/java/gradle/tasks/dependency-tasks.gradle',
  'languages/java/gradle/tasks/lint-tasks.gradle',
  'languages/java/gradle/tasks/tool-jdk.gradle',
  'languages/java/builds/rulesets/write-rules.mjs',
  'languages/java/builds/tools/tool-commands.json',
  'languages/java/builds/tools/tool-commands.mjs',
  'languages/java/adapters/gradle-reports/gradle-guards.mjs',
  'languages/java/gradle/pmd-test-ruleset.xml',
  'languages/java/gradle/spring-test-ruleset.xml',
  'languages/java/gradle/StructureMetrics.java',
  'languages/java/gradle/CpdReport.java',
  'languages/java/gradle/errorprone/error-prone.gradle',
  'languages/java/gradle/pit/pit-scope.gradle',
  'languages/java/gradle/pit/pit-retry.gradle',
  'languages/java/gradle/kotlin/kotlin-lint.gradle',
  'languages/java/gradle/kotlin/kotlin-source-modules.gradle',
  'languages/java/gradle/errorprone/checks.json',
  'languages/java/adapters/overlaps/overlap-pairs.json',
  'languages/java/gradle/errorprone/ErrorProneReport.java',
  'languages/java/detekt/nitpicker-detekt.yml',
  'languages/java/detekt/detekt-validation.yml',
  'languages/java/messages/pmd.json',
  'languages/java/messages/checkstyle.json',
  'languages/java/messages/spotbugs.json',
];

function javaSources(directory, entries) {
  return entries
    .filter((entry) => entry.endsWith('.java'))
    .map((entry) => `${directory}/${entry.replaceAll(path.sep, '/')}`);
}

function configurationContents() {
  const kotlinPsi = readdirSync(path.join(packageRoot, KOTLIN_PSI_DIRECTORY), { recursive: true });
  const archunit = readdirSync(path.join(packageRoot, ARCHUNIT_DIRECTORY), { recursive: true });
  const design = readdirSync(path.join(packageRoot, DESIGN_DIRECTORY), { recursive: true });
  return importClosure(
    [
      ...ENTRY_FILES,
      ...RESOURCE_FILES,
      ...javaSources(KOTLIN_PSI_DIRECTORY, kotlinPsi),
      ...javaSources(ARCHUNIT_DIRECTORY, archunit),
      ...javaSources(DESIGN_DIRECTORY, design),
    ],
    packageRoot,
  );
}

export function configurationFiles() {
  return [...configurationContents().keys()].sort();
}

function readPinnedVersions(initScript = INIT_SCRIPT) {
  const versions = Object.entries(readPinnedTools(initScript)).map(
    ([name, version]) => `${name}@${version}`,
  );
  return [...versions, `jscpd@${jscpdVersion()}`].join(';');
}

export function javaRuntimeVersion(spawn = spawnSync) {
  const java = javaCommand('java');
  const result = spawn(java, ['-version'], { encoding: 'utf8', timeout: 60_000 });
  if (result.status !== 0) {
    return `jdk:unavailable(${java})`;
  }
  const lines = `${result.stderr}${result.stdout}`
    .split(/\r?\n/u)
    .filter((line) => line.length > 0 && !JVM_NOISE.test(line));
  return `jdk:${lines.join(' | ')}`;
}

function hashConfiguration() {
  const hash = createHash('sha256');
  const contents = configurationContents();
  for (const relativePath of [...contents.keys()].sort()) {
    hash.update(`${relativePath}\0`);
    hash.update(contents.get(relativePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt', 'kotlin-source', 'kotlinc'];
const JVM_ANALYZER_TOOLS = [...JAVA_TOOLS, DOC_COMMENT_TOOL, COMPILE_ERROR_TOOL, HEAD_TESTS_TOOL];

export function createJavaAnalyzer({ kotlin = false } = {}) {
  const budget = javaExecutionBudget();
  let runtimeVersion;
  return {
    name: kotlin ? 'kotlin' : 'java',
    publishesModuleImports: true,
    version: readPinnedVersions(),
    resolveVersion: () => {
      runtimeVersion ??= javaRuntimeVersion();
      return `${readPinnedVersions()};${runtimeVersion}`;
    },
    configurationHash: hashConfiguration(),
    exclusions: [],
    reportedTools: kotlin ? [...JVM_ANALYZER_TOOLS, ...KOTLIN_TOOLS] : JVM_ANALYZER_TOOLS,
    timeoutMs: budget.analyzerTimeoutMs,
    comparisonKey: changedTestsKey,
    createInvocation({ projectRoot, toolRoot, mutationScope }) {
      return {
        command: process.execPath,
        args: [
          runnerPath,
          '--project-root',
          projectRoot,
          ...(kotlin ? ['--preset', 'kotlin'] : []),
          ...mutationScopeArguments(mutationScope),
        ],
        cwd: toolRoot,
      };
    },
  };
}
