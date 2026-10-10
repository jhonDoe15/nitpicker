import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from './java-duplicates.mjs';
import { INIT_SCRIPT } from './java-diff.mjs';

// The Java preset as one analyzer of the differential framework. It makes the Gradle project run
// through the same base/head machinery, reporters and exit codes as the TypeScript preset.

export const JAVA_ANALYZER_NAME = 'java';
const GRADLE_TIMEOUT_MS = 15 * 60 * 1000;
const ANALYZER_TIMEOUT_MS = GRADLE_TIMEOUT_MS + 60 * 1000;
const packageRoot = path.resolve(import.meta.dirname, '../../..');
const runnerPath = path.join(import.meta.dirname, 'java-runner.mjs');
const CONFIGURATION_FILES = [
  'languages/java/gradle/nitpicker.init.gradle',
  'languages/java/adapters/java-analyzer.mjs',
  'languages/java/adapters/java-coupling.mjs',
  'languages/java/adapters/java-diff.mjs',
  'languages/java/adapters/java-duplicates.mjs',
  'languages/java/adapters/java-policy.mjs',
  'languages/java/adapters/java-reports.mjs',
  'languages/java/adapters/java-runner.mjs',
  'languages/java/adapters/java-structure.mjs',
  'languages/java/gradle/StructureMetrics.java',
  'shared/rules/structure.mjs',
  'languages/java/adapters/touched-rules.mjs',
  'shared/glob.mjs',
  'shared/legacy-inventory.mjs',
  'shared/policy.mjs',
  'shared/rules/baseline-expansion.mjs',
  'shared/rules/coupling.mjs',
  'shared/rules/finding-helpers.mjs',
  'languages/java/ingest/checkstyle.mjs',
  'languages/java/ingest/common.mjs',
  'languages/java/ingest/archunit.mjs',
  'languages/java/ingest/crap.mjs',
  'languages/java/ingest/format-check.mjs',
  'languages/java/ingest/jacoco.mjs',
  'languages/java/ingest/jacoco-branches.mjs',
  'languages/java/ingest/pit.mjs',
  'languages/java/ingest/sarif.mjs',
];

/** The tool versions pinned in the init script, as `pmd@7.7.0;spotbugs@4.9.3;...`. */
export function readPinnedVersions(initScript = INIT_SCRIPT) {
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
  for (const relativePath of CONFIGURATION_FILES) {
    hash.update(`${relativePath}\0`);
    hash.update(readFileSync(path.join(packageRoot, relativePath)));
    hash.update('\0');
  }
  return hash.digest('hex');
}

export function createJavaAnalyzer() {
  return {
    name: JAVA_ANALYZER_NAME,
    version: readPinnedVersions(),
    configurationHash: hashConfiguration(),
    exclusions: [],
    // One Gradle run yields the findings of all the tools.
    reportedTools: [
      'pmd',
      'spotbugs',
      'google-java-format',
      'jacoco',
      'checkstyle',
      'crap',
      'duplicates',
      'pit',
      'structure',
      'coupling',
    ],
    timeoutMs: ANALYZER_TIMEOUT_MS,
    createInvocation({ projectRoot, toolRoot }) {
      return {
        command: process.execPath,
        args: [runnerPath, '--project-root', projectRoot],
        cwd: toolRoot,
      };
    },
  };
}
