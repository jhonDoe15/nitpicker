export type FloodFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity?: string;
  readonly message?: string | undefined;
  readonly classification?: string;
};

export type FloodSummary = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly message: string;
  readonly classification: string;
};

type FloodBucket<Finding extends FloodFinding> = {
  readonly modulePrefix: string;
  readonly tool: string;
  readonly rule: string;
  readonly findings: Finding[];
  readonly files: Set<string>;
};

const MIN_FLOOD_FILES = 5;
const MIN_FLOOD_PER_FILE = 100;
const TOOL_ERROR = 'tool-error';
const ENFORCEABLE = 'enforceable';

function modulePrefixOf(findingPath: string): string | undefined {
  const normalized = findingPath.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (normalized === '' || normalized === '.' || !normalized.includes('/')) {
    return undefined;
  }
  const srcIndex = normalized.indexOf('/src/');
  if (srcIndex > 0) {
    return normalized.slice(0, srcIndex);
  }
  const slashIndex = normalized.indexOf('/');
  return slashIndex > 0 ? normalized.slice(0, slashIndex) : undefined;
}

function bucketKeyOf(
  finding: FloodFinding,
): { readonly key: string; readonly modulePrefix: string } | undefined {
  if (finding.classification === TOOL_ERROR) {
    return undefined;
  }
  const modulePrefix = modulePrefixOf(finding.path);
  if (modulePrefix === undefined) {
    return undefined;
  }
  return {
    key: `${modulePrefix}\0${finding.tool}\0${finding.rule}`,
    modulePrefix,
  };
}

function isFloodBucket<Finding extends FloodFinding>(bucket: FloodBucket<Finding>): boolean {
  const fileCount = bucket.files.size;
  return fileCount >= MIN_FLOOD_FILES && bucket.findings.length >= fileCount * MIN_FLOOD_PER_FILE;
}

function classificationOf(findings: readonly FloodFinding[]): string {
  if (findings.some((finding) => finding.classification === ENFORCEABLE)) {
    return ENFORCEABLE;
  }
  return findings[0]?.classification ?? ENFORCEABLE;
}

function summaryFindingOf<Finding extends FloodFinding>(
  bucket: FloodBucket<Finding>,
): FloodSummary {
  const count = bucket.findings.length;
  const fileCount = bucket.files.size;
  const average = Math.round(count / fileCount);
  return {
    tool: bucket.tool,
    rule: bucket.rule,
    path: bucket.modulePrefix,
    identity: `generated-flood:${bucket.modulePrefix}:${bucket.tool}:${bucket.rule}`,
    message: `${bucket.modulePrefix} has ${String(count)} ${bucket.rule} findings across ${String(fileCount)} files (${String(average)}/file) and looks like generated code. Add it to "exclude" or "generatedFiles" in nitpicker.config.json, or narrow the rule.`,
    classification: classificationOf(bucket.findings),
  };
}

function floodedSummaries(findings: readonly FloodFinding[]): Map<string, FloodSummary> {
  const buckets = new Map<string, FloodBucket<FloodFinding>>();
  for (const finding of findings) {
    const tagged = bucketKeyOf(finding);
    if (tagged === undefined) {
      continue;
    }
    const existing = buckets.get(tagged.key);
    if (existing !== undefined) {
      existing.findings.push(finding);
      existing.files.add(finding.path);
    } else {
      buckets.set(tagged.key, {
        modulePrefix: tagged.modulePrefix,
        tool: finding.tool,
        rule: finding.rule,
        findings: [finding],
        files: new Set([finding.path]),
      });
    }
  }
  const summaries = new Map<string, FloodSummary>();
  for (const [key, bucket] of buckets) {
    if (isFloodBucket(bucket)) {
      summaries.set(key, summaryFindingOf(bucket));
    }
  }
  return summaries;
}

export function collapseGeneratedFloods<Finding extends FloodFinding>(
  findings: readonly Finding[],
): (Finding | FloodSummary)[] {
  const summaries = floodedSummaries(findings);
  if (summaries.size === 0) {
    return [...findings];
  }
  const emitted = new Set<string>();
  const collapsed: (Finding | FloodSummary)[] = [];
  for (const finding of findings) {
    const tagged = bucketKeyOf(finding);
    const summary = tagged === undefined ? undefined : summaries.get(tagged.key);
    if (tagged === undefined || summary === undefined) {
      collapsed.push(finding);
      continue;
    }
    if (!emitted.has(tagged.key)) {
      emitted.add(tagged.key);
      collapsed.push(summary);
    }
  }
  return collapsed;
}
