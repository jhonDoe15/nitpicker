import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from '../../../core/tooling/jscpd/run-jscpd.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import { INIT_SCRIPT, readPinnedTools } from '../builds/java-build.mjs';
import { importClosure } from '../../../shared/import-closure.mjs';
import { javaExecutionBudget } from './java-runner.mjs';

const packageRoot = path.resolve(import.meta.dirname, '../../..');
const runnerPath = path.join(import.meta.dirname, 'java-runner.mjs');
const ENTRY_FILES = [
  'languages/java/adapters/java-analyzer.mjs',
  'languages/java/adapters/java-runner.mjs',
];
const ARCHUNIT_DIRECTORY = 'languages/java/gradle/archunit';
const KOTLIN_PSI_DIRECTORY = 'languages/java/gradle/kotlin-psi';
const RESOURCE_FILES = [
  'languages/java/adapters/gradle-wrapper/gradle-supervisor.mjs',
  'languages/java/gradle/nitpicker.init.gradle',
  'languages/java/gradle/checkstyle-suppressions.xml',
  'languages/java/gradle/checkstyle-suppressions-unformatted.xml',
  'languages/java/gradle/pmd-ruleset.xml',
  'languages/java/gradle/pmd-main-ruleset.xml',
  'languages/java/gradle/spring-ruleset.xml',
  'languages/java/gradle/pmd-test-ruleset.xml',
  'languages/java/gradle/spring-test-ruleset.xml',
  'languages/java/gradle/StructureMetrics.java',
  'languages/java/gradle/errorprone/error-prone.gradle',
  'languages/java/gradle/kotlin/kotlin-lint.gradle',
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
  return importClosure(
    [
      ...ENTRY_FILES,
      ...RESOURCE_FILES,
      ...javaSources(KOTLIN_PSI_DIRECTORY, kotlinPsi),
      ...javaSources(ARCHUNIT_DIRECTORY, archunit),
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

export function createJavaAnalyzer({ kotlin = false } = {}) {
  const budget = javaExecutionBudget();
  return {
    name: kotlin ? 'kotlin' : 'java',
    version: readPinnedVersions(),
    configurationHash: hashConfiguration(),
    exclusions: [],
    reportedTools: kotlin ? [...JAVA_TOOLS, ...KOTLIN_TOOLS] : JAVA_TOOLS,
    timeoutMs: budget.analyzerTimeoutMs,
    createInvocation({ projectRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [
          runnerPath,
          '--project-root',
          projectRoot,
          ...(kotlin ? ['--preset', 'kotlin'] : []),
        ],
        cwd: toolRoot,
      };
    },
  };
}
