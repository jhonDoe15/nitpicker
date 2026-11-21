import { isPlainObject as isRecord } from '../config.mts';

const MEMBER_FIELDS = new Set([
  'tool',
  'rule',
  'path',
  'identity',
  'message',
  'classification',
  'metric',
  'symbol',
  'location',
]);
const METRIC_NAME = /^[A-Za-z_$][\w$.-]*$/u;

type Metric = { readonly name: string; readonly value: number };
type Located = { readonly line: number };

type MemberFinding = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly symbol: string;
  readonly message?: unknown;
  readonly classification: 'descriptive';
  readonly metric: Metric;
  readonly location?: Located;
};

type Group = {
  readonly tool: string;
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly classification: 'descriptive';
  readonly symbol: string;
  readonly location?: Located;
};

type OpenGroup = { readonly key: string; readonly metrics: Record<string, number> };

function hasOnlyKeys(value: object, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function plainLocation(location: unknown): location is Located | undefined {
  return (
    location === undefined ||
    (isRecord(location) && hasOnlyKeys(location, ['line']) && Number.isInteger(location['line']))
  );
}

function plainMetric(metric: unknown): metric is Metric {
  return (
    isRecord(metric) &&
    hasOnlyKeys(metric, ['name', 'value']) &&
    typeof metric['name'] === 'string' &&
    METRIC_NAME.test(metric['name']) &&
    metric['name'] !== '__proto__' &&
    typeof metric['value'] === 'number' &&
    Number.isFinite(metric['value'])
  );
}

function hasMemberShape(finding: unknown): finding is MemberFinding {
  return (
    isRecord(finding) &&
    Object.keys(finding).every((key) => MEMBER_FIELDS.has(key)) &&
    finding['classification'] === 'descriptive' &&
    ['tool', 'rule', 'path', 'identity', 'symbol'].every(
      (field) => typeof finding[field] === 'string' && finding[field] !== '',
    ) &&
    plainMetric(finding['metric']) &&
    plainLocation(finding['location'])
  );
}

function memberOf(finding: unknown): { key: string; group: Group; metric: Metric } | undefined {
  if (!hasMemberShape(finding)) {
    return undefined;
  }
  const { tool, rule, path, identity, symbol, location, metric } = finding;
  const suffix = `:${metric.name}`;
  if (
    finding.message !== `${metric.name} for ${symbol}` ||
    !identity.endsWith(suffix) ||
    identity === suffix
  ) {
    return undefined;
  }
  const groupIdentity = identity.slice(0, -suffix.length);
  return {
    key: JSON.stringify([tool, rule, path, groupIdentity, symbol, location?.line ?? null]),
    group: {
      tool,
      rule,
      path,
      identity: groupIdentity,
      classification: 'descriptive',
      symbol,
      ...(location === undefined ? {} : { location: { line: location.line } }),
    },
    metric,
  };
}

export function compactMetricFindings(findings: readonly unknown[]): unknown[] {
  const compacted: unknown[] = [];
  let open: OpenGroup | undefined;
  for (const finding of findings) {
    const member = memberOf(finding);
    if (member === undefined) {
      open = undefined;
      compacted.push(finding);
      continue;
    }
    if (open?.key === member.key && !Object.hasOwn(open.metrics, member.metric.name)) {
      open.metrics[member.metric.name] = member.metric.value;
      continue;
    }
    open = { key: member.key, metrics: { [member.metric.name]: member.metric.value } };
    compacted.push({ ...member.group, metrics: open.metrics });
  }
  return compacted;
}

type GroupEntry = Record<string, unknown> & {
  readonly metrics: Record<string, unknown>;
  readonly identity: string;
  readonly symbol: string;
};

function isGroup(entry: unknown): entry is GroupEntry {
  return (
    isRecord(entry) &&
    isRecord(entry['metrics']) &&
    Object.keys(entry['metrics']).length > 0 &&
    entry['message'] === undefined &&
    entry['metric'] === undefined &&
    typeof entry['identity'] === 'string' &&
    typeof entry['symbol'] === 'string'
  );
}

export function expandMetricFindings(entries: readonly unknown[]): unknown[] {
  return entries.flatMap((entry): unknown[] => {
    if (!isGroup(entry)) {
      return [entry];
    }
    const { metrics, ...shared } = entry;
    return Object.entries(metrics).map(([name, value]) => ({
      ...shared,
      identity: `${shared.identity}:${name}`,
      message: `${name} for ${shared.symbol}`,
      metric: { name, value },
    }));
  });
}
