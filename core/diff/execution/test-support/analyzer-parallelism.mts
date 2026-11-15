export function withDefaultAnalyzerParallelism<T>(run: () => T): T {
  const process: { env: { NITPICKER_MAX_PARALLEL?: string | undefined } } = globalThis.process;
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
