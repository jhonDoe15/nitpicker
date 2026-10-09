// Test helper: lets one test run its analyzers side by side.
//
// vitest.config.mts pins NITPICKER_MAX_PARALLEL to 1 so that the suite does not oversubscribe the
// machine, which also serializes the analyzers inside a test that runs many of them one after the
// other. A test that runs several independent tools can overlap them with this helper, as a user's
// run does (the scheduler's own default is up to 4 tools; analyzers that share a concurrency group
// still run one at a time). `run` must be synchronous: the setting is restored when it returns.

/** Runs `run()` with the analyzer scheduler's default parallelism instead of the suite's pin of 1. */
export function withDefaultAnalyzerParallelism(run) {
  const previous = process.env.NITPICKER_MAX_PARALLEL;
  delete process.env.NITPICKER_MAX_PARALLEL;
  try {
    return run();
  } finally {
    if (previous !== undefined) {
      process.env.NITPICKER_MAX_PARALLEL = previous;
    }
  }
}
