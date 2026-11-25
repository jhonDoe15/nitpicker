import type { Finding } from '../../../../shared/values/findings.mts';
import { runTypedCheckParts } from '../../adapters/typed-engine/typed-checks.mts';
import type { TypedPlan } from '../unused-api/engine/typed-plans.mts';
import { unusedApiPlan } from '../unused-api/analyze.mts';
import { designPlan } from './analyze.mts';

type Request = {
  readonly projectRoot: string;
  readonly configPath: string;
  readonly analyzerName: string;
  readonly environment: NodeJS.ProcessEnv;
};

type Failed = { readonly error: string };

type Outcome<T> = T | Failed;

const ANALYSES = [
  ['unused-api', unusedApiPlan],
  ['design-signals', designPlan],
] as const;

function attempt<T>(run: () => T): Outcome<T> {
  try {
    return run();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function isFailed<T>(outcome: Outcome<T>): outcome is Failed {
  return typeof outcome === 'object' && outcome !== null && 'error' in outcome;
}

export function analyzeTypedStructure(
  request: Request,
): Readonly<Record<string, Outcome<Finding[]>>> {
  const plans = ANALYSES.map(([rule, plan]) => ({
    rule,
    plan: attempt((): TypedPlan<Finding[]> => plan(request)),
  }));
  const asked = plans.flatMap(({ plan }) =>
    isFailed(plan) || plan.part === undefined ? [] : [plan],
  );
  const results = attempt(() =>
    runTypedCheckParts(
      asked.flatMap(({ part }) => (part === undefined ? [] : [part])),
      request.environment,
    ),
  );
  const positions = new Map(asked.map((plan, index) => [plan, index]));
  return Object.fromEntries(
    plans.map(({ rule, plan }) => {
      if (isFailed(plan)) {
        return [rule, plan];
      }
      if (isFailed(results)) {
        return [rule, plan.part === undefined ? attempt(() => plan.finish(undefined)) : results];
      }
      return [rule, attempt(() => plan.finish(results[positions.get(plan) ?? -1]))];
    }),
  );
}
