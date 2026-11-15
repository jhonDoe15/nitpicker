import { isPlainObject as isRecord } from '../config.mjs';

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

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

function plainLocation(location) {
  return (
    location === undefined ||
    (isRecord(location) && hasOnlyKeys(location, ['line']) && Number.isInteger(location.line))
  );
}

function plainMetric(metric) {
  return (
    isRecord(metric) &&
    hasOnlyKeys(metric, ['name', 'value']) &&
    typeof metric.name === 'string' &&
    METRIC_NAME.test(metric.name) &&
    metric.name !== '__proto__' &&
    typeof metric.value === 'number' &&
    Number.isFinite(metric.value)
  );
}

function hasMemberShape(finding) {
  return (
    isRecord(finding) &&
    Object.keys(finding).every((key) => MEMBER_FIELDS.has(key)) &&
    finding.classification === 'descriptive' &&
    ['tool', 'rule', 'path', 'identity', 'symbol'].every(
      (field) => typeof finding[field] === 'string' && finding[field] !== '',
    ) &&
    plainMetric(finding.metric) &&
    plainLocation(finding.location)
  );
}

function memberOf(finding) {
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

export function compactMetricFindings(findings) {
  const compacted = [];
  let open;
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

function isGroup(entry) {
  return (
    isRecord(entry) &&
    isRecord(entry.metrics) &&
    Object.keys(entry.metrics).length > 0 &&
    entry.message === undefined &&
    entry.metric === undefined &&
    typeof entry.identity === 'string' &&
    typeof entry.symbol === 'string'
  );
}

export function expandMetricFindings(entries) {
  return entries.flatMap((entry) => {
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
