function withoutHelpUri(value) {
  if (typeof value !== 'object' || value === null || !('helpUri' in value)) {
    return value;
  }
  const { helpUri: _link, ...rest } = value;
  return rest;
}

/** A parsed report with the `helpUri` of each finding left out, for tests that compare which findings exist. */
export function withoutHelpUris(report) {
  return Array.isArray(report) ? report.map(withoutHelpUri) : report;
}
