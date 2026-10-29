import { enclosingOpen } from './kotlin-source.mjs';

const LOOP_LOOKBACK = 200;
const RETRY_LOOP_HEADER = /(?:\b(?:for|while)\s*\([^{}]*\)|\bdo|\brepeat\s*\([^()]*\))\s*$/;

export function isRetry(code, tryBlock) {
  const body = code.slice(tryBlock.open, tryBlock.close);
  if (!/\b(?:return|break)\b/.test(body)) {
    return false;
  }
  const outer = enclosingOpen(code, tryBlock.open);
  return (
    outer !== -1 && RETRY_LOOP_HEADER.test(code.slice(Math.max(0, outer - LOOP_LOOKBACK), outer))
  );
}
