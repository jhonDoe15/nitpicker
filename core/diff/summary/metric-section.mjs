export function appendMetricSection(lines, metrics) {
  if (metrics.length === 0) {
    return;
  }
  lines.push('', 'Changed metrics:');
  for (const metric of metrics) {
    const change = `${String(metric.baseValue)} -> ${String(metric.headValue)}`;
    lines.push(
      `${metric.tool}/${metric.rule} ${metric.path} ${metric.metric}: ${change} (${formatDelta(metric.delta)})`,
    );
  }
}

function formatDelta(delta) {
  return delta > 0 ? `+${String(delta)}` : String(delta);
}
