import { fieldOf, textOf } from '../../../../shared/values/readers.mts';

const MAX_DECIMALS = 12;

export function metricSuffix(finding: unknown): string {
  const metric = fieldOf(finding, 'metric');
  if (metric === undefined) {
    return '';
  }
  const limitValue = fieldOf(metric, 'limit');
  const limit = limitValue === undefined ? '' : `, limit ${textOf(limitValue)}`;
  return ` (${textOf(fieldOf(metric, 'name'))} ${textOf(fieldOf(metric, 'value'))}${limit})`;
}

function decimalsOf(value: unknown): number {
  const text = textOf(value);
  if (/e/iu.test(text)) {
    return MAX_DECIMALS;
  }
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

export function metricChange(metric: unknown): string {
  const baseValue = fieldOf(metric, 'baseValue');
  const headValue = fieldOf(metric, 'headValue');
  const precision = Math.min(Math.max(decimalsOf(baseValue), decimalsOf(headValue)), MAX_DECIMALS);
  const rounded = Number(Number(fieldOf(metric, 'delta')).toFixed(precision));
  const shown = rounded.toFixed(precision);
  return `${textOf(baseValue)} -> ${textOf(headValue)} (${rounded > 0 ? `+${shown}` : shown})`;
}
