import { createHash } from 'node:crypto';
import path from 'node:path';
import { jscpdVersion } from './metrics/java-duplicates.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
import { INIT_SCRIPT, readPinnedTools } from '../builds/java-build.mjs';
import { importClosure } from '../../../shared/import-closure.mjs';

const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const ANALYZER_TIMEOUT_MS = GRADLE_TIMEOUT_MS + 60 * 1000;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const runnerPath = path.join(import.meta.dirname, 'java-runner.mjs');
const ENTRY_FILES = [
  'languages/java/adapters/java-analyzer.mjs',
  'languages/java/adapters/java-runner.mjs',
];
const RESOURCE_FILES = [
  'languages/java/gradle/nitpicker.init.gradle',
  'languages/java/gradle/checkstyle-suppressions.xml',
  'languages/java/gradle/pmd-ruleset.xml',
  'languages/java/gradle/spring-ruleset.xml',
  'languages/java/gradle/rules/checkstyle-all.xml',
  'languages/java/gradle/rules/checkstyle-main.xml',
  'languages/java/gradle/rules/forbidden-apis.txt',
  'languages/java/gradle/rules/guards-ruleset.xml',
  'languages/java/gradle/rules/test-honesty-ruleset.xml',
  'languages/java/gradle/tasks/cpd-task.gradle',
  'languages/java/gradle/tasks/dependency-tasks.gradle',
  'languages/java/gradle/tasks/lint-tasks.gradle',
  'languages/java/gradle/StructureMetrics.java',
  'languages/java/gradle/KotlinMetrics.java',
  'languages/java/detekt/nitpicker-detekt.yml',
  'languages/java/detekt/detekt-validation.yml',
];

function configurationContents() {
  return importClosure([...ENTRY_FILES, ...RESOURCE_FILES], packageRoot);
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

const KOTLIN_TOOLS = ['detekt', 'ktlint', 'ktfmt'];

export function createJavaAnalyzer({ kotlin = false } = {}) {
  return {
    name: kotlin ? 'kotlin' : 'java',
    version: readPinnedVersions(),
    configurationHash: hashConfiguration(),
    exclusions: [],
    reportedTools: kotlin ? [...JAVA_TOOLS, ...KOTLIN_TOOLS] : JAVA_TOOLS,
    timeoutMs: ANALYZER_TIMEOUT_MS,
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
