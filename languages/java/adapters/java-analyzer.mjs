import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { jscpdVersion } from '../../../core/tooling/jscpd/run-jscpd.mjs';
import { INIT_SCRIPT } from './java-diff.mjs';

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
  'languages/java/adapters/gradle-presets.mjs',
  'languages/java/adapters/kotlin-duplicates.mjs',
  'languages/java/adapters/kotlin-metrics.mjs',
  'languages/java/adapters/kotlin-options.mjs',
  'languages/java/adapters/kotlin-reports.mjs',
  'languages/java/adapters/kotlin-rules.mjs',
  'languages/java/adapters/kotlin-suppressions.mjs',
  'languages/java/detekt/nitpicker-detekt.yml',
  'languages/java/adapters/kotlin-tools.mjs',
  'languages/java/detekt/detekt-validation.yml',
  'languages/java/gradle/KotlinMetrics.java',
  'languages/java/gradle/StructureMetrics.java',
  'shared/rules/structure.mjs',
  'shared/rules/crap.mjs',
  'core/tooling/jscpd/import-only.mjs',
  'core/tooling/jscpd/import-only/jvm-imports.mjs',
  'core/tooling/jscpd/import-only/python-imports.mjs',
  'core/tooling/jscpd/import-only/script-imports.mjs',
  'core/tooling/jscpd/jscpd-clones.mjs',
  'core/tooling/jscpd/run-jscpd.mjs',
  'core/tooling/jscpd/skipped-folders.mjs',
  'shared/finding-policy.mjs',
  'shared/rules/duplicates.mjs',
  'shared/glob.mjs',
  'shared/legacy-inventory.mjs',
  'shared/policy.mjs',
  'shared/rules/baseline-expansion.mjs',
  'shared/rules/coupling.mjs',
  'shared/rules/finding-helpers.mjs',
  'languages/java/ingest/checkstyle.mjs',
  'shared/ingest/common.mjs',
  'shared/ingest/prepare-sarif.mjs',
  'shared/ingest/structure-report.mjs',
  'languages/java/ingest/archunit.mjs',
  'languages/java/ingest/crap.mjs',
  'shared/ingest/lizard-crap.mjs',
  'shared/ingest/format-check.mjs',
  'languages/java/ingest/jacoco.mjs',
  'languages/java/ingest/jacoco-branches.mjs',
  'languages/java/ingest/kotlin-branches.mjs',
  'languages/java/ingest/pit.mjs',
  'shared/ingest/sarif.mjs',
];

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

const JAVA_TOOLS = [
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
];
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
