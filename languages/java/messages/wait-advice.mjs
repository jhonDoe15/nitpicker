import { readFileSync } from 'node:fs';
import { pathInside, sourceFilesUnder } from '../adapters/review-rules/java-sources.mjs';

export const FIXED_SLEEP_RULE = 'FixedSleepInTest';

const AWAITILITY_ADVICE =
  "A fixed wait makes the test slow and flaky. Wait on the condition with Awaitility, which the project's tests use: await().atMost(Duration.ofSeconds(5)).until(...) with the real condition, not pollDelay(...).until(() -> true); verify(mock, timeout(1000)) for a mock. A sleep in a mock answer or a thread body is allowed. If a real wait is unavoidable, add an exception for pmd/FixedSleepInTest in nitpicker.config.json.";
const AWAITILITY_IMPORT = /^\s*import\s+(?:static\s+)?org\.awaitility\./mu;
const TEST_EXTENSIONS = ['.java', '.kt'];

function isFixedSleep(finding) {
  return finding.tool === 'pmd' && finding.rule === FIXED_SLEEP_RULE;
}

function importsAwaitility(projectRoot, manifest) {
  const roots = [...(manifest?.testSourceRoots ?? []), ...(manifest?.kotlinTestSourceRoots ?? [])];
  return roots.some((root) =>
    sourceFilesUnder(pathInside(projectRoot, root), TEST_EXTENSIONS).some((file) =>
      AWAITILITY_IMPORT.test(readFileSync(file, 'utf8')),
    ),
  );
}

export function withWaitAdvice(findings, { manifest, projectRoot }) {
  if (!findings.some(isFixedSleep)) {
    return findings;
  }
  const awaitility =
    manifest?.testAwaitility === true ||
    (projectRoot !== undefined && importsAwaitility(projectRoot, manifest));
  if (!awaitility) {
    return findings;
  }
  return findings.map((finding) =>
    isFixedSleep(finding) ? { ...finding, message: AWAITILITY_ADVICE } : finding,
  );
}
