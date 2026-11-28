import {
  type TypedCheckPart,
  runTypedCheckParts,
} from '../../../adapters/typed-engine/typed-checks.mts';
import type { Environment } from '../../../../../shared/processes/environment.mts';

export type TypedPlan<T> = {
  readonly part?: TypedCheckPart | undefined;
  readonly finish: (result: unknown) => T;
};

export type EnginePart<T> = {
  readonly part: TypedCheckPart;
  readonly read: (result: unknown) => T;
};

export function engineAnswer<T>(engine: EnginePart<T> | undefined, result: unknown): T | undefined {
  return engine === undefined || result === undefined ? undefined : engine.read(result);
}

export function runTypedPlan<T>(plan: TypedPlan<T>, environment: Environment): T {
  const [result] = plan.part === undefined ? [] : runTypedCheckParts([plan.part], environment);
  return plan.finish(result);
}
