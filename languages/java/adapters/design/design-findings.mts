import { readHeadPolicyFile } from '../../../../shared/head-policy.mjs';
import { DESIGN_RULES } from '../../../../shared/project-rules/design/design-rules.mjs';
import { sharedFactFindings } from '../../../../shared/rules/facts/evaluate.mjs';
import { type DesignModule, produceDesignFacts } from './producer/design-facts.mts';
import { fieldsOf } from '../../../../shared/values/readers.mts';
import { type JavaFinding, type JavaPolicy, findingsOf } from '../typed/java-values.mts';

type Evaluate = (facts: unknown, options: Readonly<Record<string, unknown>>) => unknown;
type DesignRequest = {
  readonly projectRoot: string;
  readonly listModules: () => readonly DesignModule[];
  readonly policy: JavaPolicy | undefined;
  readonly analyzerName?: string;
  readonly output: string;
  readonly evaluate?: Evaluate;
};

export const DESIGN_FACTS_FAILURE_RULE = 'design-facts-failure';
export const DESIGN_FACTS_FILE = 'design-facts.json';

function toolError(analyzerName: string, error: unknown): JavaFinding {
  const message = error instanceof Error ? error.message : String(error);
  return {
    tool: analyzerName,
    rule: DESIGN_FACTS_FAILURE_RULE,
    path: '.',
    identity: DESIGN_FACTS_FAILURE_RULE,
    message: `The design rules could not read the Java sources: ${message}`,
    classification: 'tool-error',
  };
}

export function designPolicy(
  policy: JavaPolicy = {},
  headPolicy: unknown = readHeadPolicyFile(),
): Readonly<Record<string, unknown>> {
  const head = fieldsOf(headPolicy);
  const protocols = policy['protocols'] ?? head['protocols'];
  return {
    ...head,
    ...(protocols === undefined ? {} : { protocols }),
    exceptions: policy.exceptions ?? head['exceptions'] ?? [],
  };
}

export function designFindings({
  projectRoot,
  listModules,
  policy,
  analyzerName = 'java',
  output,
  evaluate = sharedFactFindings,
}: DesignRequest): JavaFinding[] {
  if (analyzerName !== 'java') {
    return [];
  }
  try {
    const facts = produceDesignFacts({ projectRoot, modules: listModules(), output });
    return findingsOf(
      evaluate(facts, {
        language: 'java',
        analyzerName,
        policy: designPolicy(policy),
        rules: DESIGN_RULES,
      }),
    );
  } catch (error) {
    return [toolError(analyzerName, error)];
  }
}
