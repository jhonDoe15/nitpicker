import { routeFields } from '../../../../shared/messages/exception-sentence.mjs';
import {
  adviceProblems,
  withGrowthAdvice,
  withWorseMessage,
} from '../../../../shared/messages/advice/finding-advice.mjs';
import {
  withoutCauses,
  withUntouchedCause,
} from '../../../../shared/rules/stability/untouched-cause.mjs';
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

export const worseMessageOf: (finding: TrackedFinding, baseValue: number) => TrackedFinding =
  withWorseMessage;

const growthAdvised: (
  finding: TrackedFinding,
  baseValue: number,
) => Readonly<Record<string, unknown>> = withGrowthAdvice;

const REQUIRED_TEXT = ['tool', 'rule', 'path', 'identity', 'message', 'classification'];

function isTracked(value: Readonly<Record<string, unknown>>): value is TrackedFinding {
  return REQUIRED_TEXT.every((field) => typeof value[field] === 'string');
}

export function growthAdviceOf(finding: TrackedFinding, baseValue: number): TrackedFinding {
  const advised = growthAdvised(finding, baseValue);
  if (!isTracked(advised)) {
    throw new TypeError('growth advice did not return a finding');
  }
  return advised;
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
