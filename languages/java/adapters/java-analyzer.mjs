import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from './metrics/java-duplicates.mjs';
import { INIT_SCRIPT } from './java-diff.mjs';
import { JAVA_TOOLS } from './gradle-presets.mjs';
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
  'languages/java/gradle/StructureMetrics.java',
  'languages/java/gradle/KotlinMetrics.java',
  'languages/java/detekt/nitpicker-detekt.yml',
  'languages/java/detekt/detekt-validation.yml',
  'languages/java/gradle/archunit/ArchRules.java',
  'languages/java/gradle/archunit/Found.java',
  'languages/java/gradle/archunit/Layers.java',
  'languages/java/gradle/archunit/Layout.java',
  'languages/java/gradle/archunit/Spring.java',
  'languages/java/gradle/archunit/TestRules.java',
];

function configurationContents() {
  return importClosure([...ENTRY_FILES, ...RESOURCE_FILES], packageRoot);
}

export function configurationFiles() {
  return [...configurationContents().keys()].sort();
}

function readPinnedVersions(initScript = INIT_SCRIPT) {
  const block = /def pinned = \[([^\]]*)\]/.exec(readFileSync(initScript, 'utf8'));
  const versions = [...(block?.[1] ?? '').matchAll(/(\w+)\s*:\s*'([^']+)'/g)].map(
    ([, name, version]) => `${name}@${version}`,
  );
  if (versions.length === 0) {
    throw new Error(`No pinned tool versions found in ${initScript}`);
  }
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
