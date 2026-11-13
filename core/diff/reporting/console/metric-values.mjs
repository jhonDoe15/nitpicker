const MAX_DECIMALS = 12;

export function metricSuffix(finding) {
  const { metric } = finding;
  if (metric === undefined) {
    return '';
  }
  const limit = metric.limit === undefined ? '' : `, limit ${String(metric.limit)}`;
  return ` (${metric.name} ${String(metric.value)}${limit})`;
}

function decimalsOf(value) {
  const text = String(value);
  if (/e/iu.test(text)) {
    return MAX_DECIMALS;
  }
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

export function metricChange({ baseValue, headValue, delta }) {
  const precision = Math.min(Math.max(decimalsOf(baseValue), decimalsOf(headValue)), MAX_DECIMALS);
  const rounded = Number(delta.toFixed(precision));
  const shown = rounded.toFixed(precision);
  return `${String(baseValue)} -> ${String(headValue)} (${rounded > 0 ? `+${shown}` : shown})`;
}
