import { symbolOf } from '../../plan-parts/finding.mjs';
import { functionExtent } from '../../plan-parts/source.mjs';

export function groupTarget(findings, env) {
  const lines = findings.map(({ location }) => location?.line ?? 1);
  const { path } = findings[0];
  const symbol = symbolOf(findings[0]);
  const extent = functionExtent(findings[0], symbol, env);
  return {
    path,
    ...(symbol === undefined ? {} : { symbol }),
    startLine: Math.min(extent?.startLine ?? Infinity, ...lines),
    endLine: Math.max(extent?.endLine ?? 0, ...lines),
  };
}

export function uniqueOf(findings, pick) {
  return [...new Set(findings.map(pick))];
}
