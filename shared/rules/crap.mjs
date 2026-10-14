import {
  DEFAULT_CRAP_SCORE_LIMIT,
  GREW_MESSAGES,
  HELD_MESSAGES,
  MESSAGES,
  RULE_IDS,
  renderMessage,
} from '../policy.mjs';
import { positiveInteger } from './finding-helpers.mjs';
import { exceptionRoute } from '../exceptions/rule-names.mjs';

// Neutral input: one entry per function, `{ path, name, identity, ratchetKey?, line?, crap? }`.
// `crap` is the function's CRAP score, or anything that is not a finite number when its coverage is
// unknown. The adapter computes the score and the identity (both are language-specific; the
// identity includes the function's source hash); this rule decides:
//   `crap-coverage-unknown` (enforceable) when `crap` is not a finite number;
//   `crap-score-limit` (enforceable) when `crap` >= `limit`.
// `ratchetKey` names the function without its source hash. With it, a function that was already
// over the limit on the base and was edited fails only when its score rose (see the ratchet in
// core/diff/compare.mjs); without it, every edit of an over-limit function is a new finding.

export function crapFindings(
  functions,
  { tool, limit = DEFAULT_CRAP_SCORE_LIMIT, unknownMessage = MESSAGES.crapCoverageUnknown },
) {
  const findings = [];
  for (const fn of functions) {
    const unknown = typeof fn.crap !== 'number' || !Number.isFinite(fn.crap);
    if (!unknown && fn.crap < limit) {
      continue;
    }
    const rule = unknown ? RULE_IDS.crapCoverageUnknown : RULE_IDS.crapScoreLimit;
    const route = exceptionRoute({ rule, path: fn.path, name: fn.name });
    const finding = {
      tool,
      rule,
      path: fn.path,
      identity: fn.identity,
      message: `${
        unknown
          ? renderMessage(unknownMessage, { name: fn.name })
          : renderMessage(MESSAGES.crapScoreLimit, {
              name: fn.name,
              crap: fn.crap.toFixed(2),
              limit,
            })
      } ${route}`,
      classification: 'enforceable',
      symbol: fn.name,
      ...(positiveInteger(fn.line) === undefined ? {} : { location: { line: fn.line } }),
    };
    findings.push(
      unknown || fn.ratchetKey === undefined ? finding : withRatchet(finding, fn, limit, route),
    );
  }
  return findings;
}

// The score is rounded to what the message shows, so noise below that never counts as a rise.
function withRatchet(finding, fn, limit, route) {
  const crap = Number(fn.crap.toFixed(2));
  return {
    ...finding,
    ratchet: {
      key: fn.ratchetKey,
      value: crap,
      worseMessage: `${renderMessage(GREW_MESSAGES.crap, {
        name: fn.name,
        crap,
        limit,
        base: '{base}',
      })} ${route}`,
      heldMessage: renderMessage(HELD_MESSAGES.crap, {
        name: fn.name,
        crap: fn.crap.toFixed(2),
        limit,
        base: '{base}',
      }),
    },
  };
}
