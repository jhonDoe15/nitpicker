export const FIXED_SLEEP_RULE = 'FixedSleepInTest';

const AWAITILITY_ADVICE =
  "A fixed sleep makes the test slow and flaky. Wait on the condition with Awaitility, which the project's tests use: await().atMost(Duration.ofSeconds(5)).until(...), or verify(mock, timeout(1000)) for a mock. If a real wait is unavoidable, add an exception for pmd/FixedSleepInTest in nitpicker.config.json.";

export function withWaitAdvice(findings, manifest) {
  if (manifest?.testAwaitility !== true) {
    return findings;
  }
  return findings.map((finding) =>
    finding.tool === 'pmd' && finding.rule === FIXED_SLEEP_RULE
      ? { ...finding, message: AWAITILITY_ADVICE }
      : finding,
  );
}
