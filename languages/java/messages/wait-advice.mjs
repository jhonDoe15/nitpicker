import { readFileSync } from 'node:fs';
import {
  offsetOf,
  pathInside,
  readJavaSource,
  sourceFilesUnder,
} from '../adapters/review-rules/java-sources.mjs';

export const FIXED_SLEEP_RULE = 'FixedSleepInTest';

const AWAITILITY_ADVICE =
  "A fixed wait makes the test slow and flaky. Wait on the condition with Awaitility, which the project's tests use: await().atMost(Duration.ofSeconds(5)).until(...) with the real condition, not pollDelay(...).until(() -> true); verify(mock, timeout(1000)) for a mock. A sleep in a mock answer or a thread body is allowed. If a real wait is unavoidable, add an exception for pmd/FixedSleepInTest in nitpicker.config.json.";
const TIMED_WAIT_ADVICE =
  'A timed wait, join(ms) or wait(ms), returns as soon as the thread ends or is notified, so it does not slow a passing test, but it also returns when the time runs out, and the test then goes on as if the wait had succeeded. Check the outcome: {check}; call wait(ms) only in a loop that checks its condition against a deadline. If going on after the timeout is intended, add an exception for pmd/FixedSleepInTest in nitpicker.config.json.';
const TIMED_WAIT_CHECK =
  'assertThat(thread.join(Duration.ofSeconds(5))).isTrue() for a thread, or assert the result of CountDownLatch.await(5, SECONDS)';
const AWAITILITY_CHECK = `await().atMost(Duration.ofSeconds(5)).until(() -> !thread.isAlive()) with Awaitility, which the project's tests use, or ${TIMED_WAIT_CHECK}`;
const TIMED_WAIT = /\b(?:join|wait)\s*\(\s*[^)\s]/u;
const FIXED_WAIT = /\b(?:sleep|parkNanos)\s*\(/u;
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

function isTimedWait(finding, projectRoot) {
  const text =
    projectRoot === undefined ? undefined : readJavaSource(pathInside(projectRoot, finding.path));
  const line = finding.location?.line;
  if (text === undefined || line === undefined) {
    return false;
  }
  const statement = text.slice(offsetOf(text, { line })).split(';')[0];
  return TIMED_WAIT.test(statement) && !FIXED_WAIT.test(statement);
}

function hasAwaitility({ manifest, projectRoot }) {
  return (
    manifest?.testAwaitility === true ||
    (projectRoot !== undefined && importsAwaitility(projectRoot, manifest))
  );
}

export function withWaitAdvice(findings, { manifest, projectRoot }) {
  if (!findings.some(isFixedSleep)) {
    return findings;
  }
  const awaitility = hasAwaitility({ manifest, projectRoot });
  const timedWait = TIMED_WAIT_ADVICE.replace(
    '{check}',
    awaitility ? AWAITILITY_CHECK : TIMED_WAIT_CHECK,
  );
  return findings.map((finding) => {
    if (!isFixedSleep(finding)) {
      return finding;
    }
    if (isTimedWait(finding, projectRoot)) {
      return { ...finding, message: timedWait };
    }
    return awaitility ? { ...finding, message: AWAITILITY_ADVICE } : finding;
  });
}
