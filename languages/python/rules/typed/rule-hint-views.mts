import {
  applyRuleHints as untypedApply,
  describeRuleFinding as untypedDescribe,
  hintFor as untypedHintFor,
  RULE_HINTS as UNTYPED_HINTS,
  withHint as untypedWithHint,
} from '../rule-hints.mjs';
import { exceptionRoute as untypedRoute } from '../../../../shared/exceptions/rule-names.mjs';
import type { IngestedFinding } from '../../ingest/typed/ingest-types.mts';

type RuleHint = {
  readonly tool: string;
  readonly rules?: readonly string[];
  readonly exception?: false;
};
type HintInput = {
  readonly tool: string;
  readonly rule: string;
  readonly path?: string;
  readonly identity?: string;
  readonly message?: string;
  readonly classification?: string;
  readonly subject?: string | undefined;
  readonly hintData?: unknown;
};
export type LibrariesInput = Readonly<Record<string, unknown>>;
type WithHint = (finding: HintInput, libraries?: LibrariesInput) => IngestedFinding;
type ApplyHints = (findings: readonly HintInput[], libraries?: LibrariesInput) => IngestedFinding[];
type HintFor = (finding: HintInput) => RuleHint | undefined;
type Describe = (
  rule: string,
  subject: string,
  options?: { readonly libraries?: LibrariesInput; readonly data?: object },
) => string;
type RouteInput = {
  readonly rule: string;
  readonly path: string;
  readonly key: string;
  readonly function?: string | undefined;
  readonly name?: string | undefined;
};

function guarded<T>(check: (value: unknown) => value is T, value: unknown): T {
  if (!check(value)) {
    throw new TypeError('expected a function');
  }
  return value;
}

function isWithHint(value: unknown): value is WithHint {
  return typeof value === 'function';
}
function isApplyHints(value: unknown): value is ApplyHints {
  return typeof value === 'function';
}
function isHintFor(value: unknown): value is HintFor {
  return typeof value === 'function';
}
function isDescribe(value: unknown): value is Describe {
  return typeof value === 'function';
}
function isRoute(value: unknown): value is (input: RouteInput) => string {
  return typeof value === 'function';
}
function isHints(value: unknown): value is readonly RuleHint[] {
  return Array.isArray(value);
}

const withHint = guarded(isWithHint, untypedWithHint);
const applyRuleHints = guarded(isApplyHints, untypedApply);
const hintFor = guarded(isHintFor, untypedHintFor);
const describeRuleFinding = guarded(isDescribe, untypedDescribe);
const exceptionRoute = guarded(isRoute, untypedRoute);
const RULE_HINTS = guarded(isHints, UNTYPED_HINTS);

export { applyRuleHints, describeRuleFinding, exceptionRoute, hintFor, RULE_HINTS, withHint };
