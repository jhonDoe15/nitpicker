import { routeFields } from '../../../../shared/messages/exception-sentence.mts';
import {
  adviceProblems,
  withGrowthAdvice,
  withWorseMessage,
} from '../../../../shared/messages/advice/finding-advice.mts';
import {
  withoutCauses,
  withUntouchedCause,
} from '../../../../shared/rules/stability/untouched-cause.mts';
import { fieldOf, fieldsOf, listOf } from '../../../../shared/values/readers.mts';
import type { ChangedMetric, Compared } from './compare-types.mts';
import type { Advice, TouchedCode, TrackedFinding } from './finding-types.mts';

export const routeFieldsOf: (message: string) => Advice = routeFields;

export const problemsOf: (advice: {
  readonly message: string;
  readonly allowedForm: unknown;
  readonly exception: unknown;
  readonly exceptionList: unknown;
}) => string[] = adviceProblems;

const REQUIRED_TEXT = ['tool', 'rule', 'path', 'identity', 'message', 'classification'];

function isTracked(value: Readonly<Record<string, unknown>>): value is TrackedFinding {
  return REQUIRED_TEXT.every((field) => typeof value[field] === 'string');
}

function trackedFinding(
  advised: Readonly<Record<string, unknown>>,
  source: string,
): TrackedFinding {
  if (!isTracked(advised)) {
    throw new TypeError(`${source} did not return a finding`);
  }
  return advised;
}

export function worseMessageOf(finding: TrackedFinding, baseValue: number): TrackedFinding {
  return trackedFinding(withWorseMessage(finding, baseValue), 'worse message');
}

export function growthAdviceOf(finding: TrackedFinding, baseValue: number): TrackedFinding {
  return trackedFinding(withGrowthAdvice(finding, baseValue), 'growth advice');
}

export const withCauseExplained: (
  findings: readonly TrackedFinding[],
  touchedCode: Pick<TouchedCode, 'changedLines'> | undefined,
) => TrackedFinding[] = withUntouchedCause;

const causesRemoved: (
  result: Readonly<Record<string, readonly unknown[]>>,
) => Readonly<Record<string, readonly unknown[]>> = withoutCauses;

function isChangedMetric(value: unknown): value is ChangedMetric {
  return (
    typeof fieldOf(value, 'identity') === 'string' && typeof fieldOf(value, 'metric') === 'string'
  );
}

function isTrackedEntry(value: unknown): value is TrackedFinding {
  return typeof value === 'object' && value !== null && isTracked(fieldsOf(value));
}

export function withoutCausesIn(result: Compared): Compared {
  const clean = causesRemoved(result);
  return {
    newFindings: listOf(clean['newFindings']).filter(isTrackedEntry),
    resolvedFindings: listOf(clean['resolvedFindings']).filter(isTrackedEntry),
    unchangedFindings: listOf(clean['unchangedFindings']).filter(isTrackedEntry),
    changedMetrics: listOf(clean['changedMetrics']).filter(isChangedMetric),
  };
}
