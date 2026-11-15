function withoutHelpUri(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || !('helpUri' in value)) {
    return value;
  }
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'helpUri'));
}

export function withoutHelpUris(report: unknown): unknown {
  return Array.isArray(report) ? report.map(withoutHelpUri) : report;
}
