export function validateInvocation(analyzerName, invocation) {
  if (
    typeof invocation !== 'object' ||
    invocation === null ||
    typeof invocation.command !== 'string' ||
    !Array.isArray(invocation.args) ||
    invocation.args.some((argument) => typeof argument !== 'string')
  ) {
    throw new TypeError(`${analyzerName} produced an invalid process invocation`);
  }
}

export function validateAnalyzer(analyzer) {
  validateAnalyzerIdentity(analyzer);
  validateAnalyzerDependencies(analyzer);
  validateAnalyzerCapacity(analyzer);
  validateAnalyzerReports(analyzer);
  validateAnalyzerTimeout(analyzer);
}

function validateAnalyzerIdentity(analyzer) {
  if (typeof analyzer !== 'object' || analyzer === null) {
    throw new TypeError('Analyzer configuration must be an object');
  }
  for (const property of ['name', 'version', 'configurationHash']) {
    if (typeof analyzer[property] !== 'string' || analyzer[property].length === 0) {
      throw new TypeError(`Analyzer ${property} must be a non-empty string`);
    }
  }
  if (
    !Array.isArray(analyzer.exclusions) ||
    analyzer.exclusions.some((exclusion) => typeof exclusion !== 'string')
  ) {
    throw new TypeError(`${analyzer.name} exclusions must be an array of strings`);
  }
  if (typeof analyzer.createInvocation !== 'function') {
    throw new TypeError(`${analyzer.name} must define createInvocation`);
  }
}

function validateAnalyzerDependencies(analyzer) {
  if (
    analyzer.dependencies !== undefined &&
    (!Array.isArray(analyzer.dependencies) ||
      analyzer.dependencies.some(
        (dependency) => typeof dependency !== 'string' || dependency.length === 0,
      ))
  ) {
    throw new TypeError(`${analyzer.name} dependencies must contain non-empty strings`);
  }
}

function validateAnalyzerCapacity(analyzer) {
  if (
    analyzer.concurrencyWeight !== undefined &&
    (!Number.isInteger(analyzer.concurrencyWeight) || analyzer.concurrencyWeight < 1)
  ) {
    throw new TypeError(`${analyzer.name} concurrencyWeight must be a positive integer`);
  }
  if (
    analyzer.concurrencyGroup !== undefined &&
    (typeof analyzer.concurrencyGroup !== 'string' || analyzer.concurrencyGroup.length === 0)
  ) {
    throw new TypeError(`${analyzer.name} concurrencyGroup must be a non-empty string`);
  }
  if (
    analyzer.executionPriority !== undefined &&
    (!Number.isSafeInteger(analyzer.executionPriority) || analyzer.executionPriority < 0)
  ) {
    throw new TypeError(`${analyzer.name} executionPriority must be a non-negative safe integer`);
  }
}

function validateAnalyzerReports(analyzer) {
  if (
    analyzer.findingExitCodes !== undefined &&
    (!Array.isArray(analyzer.findingExitCodes) ||
      analyzer.findingExitCodes.some((exitCode) => !Number.isInteger(exitCode) || exitCode < 1))
  ) {
    throw new TypeError(`${analyzer.name} findingExitCodes must contain positive integers`);
  }
  if (
    analyzer.reportedTools !== undefined &&
    (!Array.isArray(analyzer.reportedTools) ||
      analyzer.reportedTools.some((tool) => typeof tool !== 'string' || tool.length === 0))
  ) {
    throw new TypeError(`${analyzer.name} reportedTools must contain non-empty strings`);
  }
}

function validateAnalyzerTimeout(analyzer) {
  if (
    analyzer.timeoutMs !== undefined &&
    (!Number.isInteger(analyzer.timeoutMs) || analyzer.timeoutMs < 1)
  ) {
    throw new TypeError(`${analyzer.name} timeoutMs must be a positive integer`);
  }
}
