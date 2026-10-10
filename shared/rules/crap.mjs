import { DEFAULT_CRAP_SCORE_LIMIT, MESSAGES, RULE_IDS, renderMessage } from '../policy.mjs';
import { positiveInteger } from './finding-helpers.mjs';

// Neutral input: one entry per function, `{ path, name, identity, line?, crap? }`. `crap` is the
// function's CRAP score, or anything that is not a finite number when its coverage is unknown.
// The adapter computes the score and the identity (both are language-specific); this rule decides:
//   `crap-coverage-unknown` (enforceable) when `crap` is not a finite number;
//   `crap-score-limit` (enforceable) when `crap` >= `limit`.

export function crapFindings(functions, { tool, limit = DEFAULT_CRAP_SCORE_LIMIT }) {
  const findings = [];
  for (const fn of functions) {
    const unknown = typeof fn.crap !== 'number' || !Number.isFinite(fn.crap);
    if (!unknown && fn.crap < limit) {
      continue;
    }
    findings.push({
      tool,
      rule: unknown ? RULE_IDS.crapCoverageUnknown : RULE_IDS.crapScoreLimit,
      path: fn.path,
      identity: fn.identity,
      message: unknown
        ? renderMessage(MESSAGES.crapCoverageUnknown, { name: fn.name })
        : renderMessage(MESSAGES.crapScoreLimit, {
            name: fn.name,
            crap: fn.crap.toFixed(2),
            limit,
          }),
      classification: 'enforceable',
      symbol: fn.name,
      ...(positiveInteger(fn.line) === undefined ? {} : { location: { line: fn.line } }),
    });
  }
  return findings;
}
