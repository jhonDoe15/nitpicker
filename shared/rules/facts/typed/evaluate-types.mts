import type { Finding } from '../../../values/findings.mts';
import type { ExplainedCycle } from '../../../graph/explained-cycles.mts';
import type { ReuseModule } from './reuse-module-types.mts';
import type { BaselineSource, Facts, RuleContext } from './fact-types.mts';

export type FactPolicy = {
  readonly layout?: unknown;
  readonly exceptions?: readonly {
    readonly rule: string;
    readonly paths?: readonly string[] | undefined;
    readonly glob?: string | undefined;
  }[];
  readonly testConsole?: { readonly allow?: readonly { readonly contains: string }[] } | undefined;
  readonly protocols?: unknown;
  readonly [setting: string]: unknown;
};

export type EvaluatorOptions = {
  readonly policy: FactPolicy;
  readonly baselineFile: BaselineSource | undefined;
  readonly publicFace?: unknown;
  readonly duplicatesAcrossPackages?: unknown;
  readonly privateCopyFix?: unknown;
  readonly collisionFixFor?: unknown;
  readonly siblingCopiesAcrossPackages?: unknown;
  readonly decisionWorkers?: unknown;
  readonly [option: string]: unknown;
};

export type EvaluatorInput = {
  readonly facts: Facts;
  readonly modules: readonly ReuseModule[];
  readonly context: RuleContext;
  readonly options: EvaluatorOptions;
};

export type PreparedFacts = {
  readonly rules: readonly string[];
  readonly facts: Facts;
  readonly context: RuleContext;
  readonly options: EvaluatorOptions;
};

export type FeatureFactAnalysis = {
  readonly findings: Finding[];
  readonly explainedCycles: ExplainedCycle[];
  readonly featureOf: (file: string) => string | undefined;
};

export type FactEvaluator = (input: EvaluatorInput) => Finding[];
