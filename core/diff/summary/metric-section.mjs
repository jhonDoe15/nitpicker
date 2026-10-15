export function appendMetricSection(lines, metrics) {
  if (metrics.length === 0) {
    return;
  }
  lines.push('', 'Changed metrics:');
  for (const metric of metrics) {
    lines.push(
      `${metric.tool}/${metric.rule} ${metric.path} ${metric.metric}: ${String(metric.baseValue)} -> ${String(metric.headValue)} (${formatDelta(metric.delta)})`,
    );
  }
}

function formatDelta(delta) {
  return delta > 0 ? `+${String(delta)}` : String(delta);
}
