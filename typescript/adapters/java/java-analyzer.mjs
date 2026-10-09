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
const packageRoot = path.resolve(import.meta.dirname, '../..');
const runnerPath = path.join(import.meta.dirname, 'java-runner.mjs');
const CONFIGURATION_FILES = [
  'java/nitpicker.init.gradle',
  'adapters/java/java-analyzer.mjs',
  'adapters/java/java-diff.mjs',
  'adapters/java/java-duplicates.mjs',
  'adapters/java/java-policy.mjs',
  'adapters/java/java-reports.mjs',
  'adapters/java/java-runner.mjs',
  'adapters/java/touched-rules.mjs',
  'shared/glob.mjs',
  'shared/legacy-inventory.mjs',
  'shared/policy.mjs',
  'shared/rules/baseline-expansion.mjs',
  'shared/rules/finding-helpers.mjs',
  'adapters/ingest/checkstyle.mjs',
  'adapters/ingest/common.mjs',
  'adapters/ingest/archunit.mjs',
  'adapters/ingest/crap.mjs',
  'adapters/ingest/format-check.mjs',
  'adapters/ingest/jacoco.mjs',
  'adapters/ingest/jacoco-branches.mjs',
  'adapters/ingest/pit.mjs',
  'adapters/ingest/sarif.mjs',
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
