import { readHeadPolicyFile } from '../../../../../../shared/head-policy.mjs';
import { DESIGN_RULES } from '../../../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../../../shared/rules/facts/evaluate.mjs';
import type { Finding } from '../../../../../../shared/values/findings.mts';
import { fieldOf, messageOf } from '../../../../../../shared/values/readers.mts';
import { readKotlinDesign } from '../report/kotlin-report.mts';

type Evaluator = (facts: unknown, options: unknown) => Finding[];
type Environment = Record<string, string | undefined>;

const evaluateShared: Evaluator = sharedFactFindings;
const readPolicy: (environment: Environment | undefined) => unknown = readHeadPolicyFile;

export const DESIGN_TOOL = 'structure';
export const DESIGN_FAILURE_RULE = 'design-facts';

function failure(message: string): Finding {
  return {
    tool: DESIGN_TOOL,
    rule: DESIGN_FAILURE_RULE,
    path: '.',
    identity: DESIGN_FAILURE_RULE,
    message: `The design rules did not run on the Kotlin sources: ${message}`,
    classification: 'tool-error',
  };
}

export function kotlinDesignBundle(design: {
  modules?: unknown;
  types: unknown;
  callables: unknown;
}): { modules: unknown; packages: never[]; types: unknown; callables: unknown } {
  return {
    modules: design.modules,
    packages: [],
    types: design.types,
    callables: design.callables,
  };
}

function designOf(reportRoot: string): { design?: unknown; problem?: string } {
  try {
    return { design: readKotlinDesign(reportRoot) };
  } catch (error) {
    return { problem: `the facts report cannot be read (${messageOf(error)})` };
  }
}

function evaluate(
  design: unknown,
  { environment, run }: { environment: Environment | undefined; run: Evaluator },
): Finding[] {
  try {
    return run(
      kotlinDesignBundle({
        modules: fieldOf(design, 'modules'),
        types: fieldOf(design, 'types'),
        callables: fieldOf(design, 'callables'),
      }),
      {
        language: 'kotlin',
        analyzerName: DESIGN_TOOL,
        rules: DESIGN_RULES,
        policy: readPolicy(environment),
      },
    );
  } catch (error) {
    return [failure(messageOf(error))];
  }
}

export function kotlinDesignFindings(
  reportRoot: string,
  {
    environment,
    evaluator = evaluateShared,
  }: { environment?: Environment | undefined; evaluator?: Evaluator } = {},
): Finding[] {
  const { design, problem } = designOf(reportRoot);
  if (problem !== undefined) {
    return [failure(problem)];
  }
  if (design === undefined) {
    return [failure('the facts report has no "design" key, so it was written by an older plugin')];
  }
  const designError = fieldOf(design, 'error');
  return typeof designError === 'string'
    ? [failure(designError)]
    : evaluate(design, { environment, run: evaluator });
}
