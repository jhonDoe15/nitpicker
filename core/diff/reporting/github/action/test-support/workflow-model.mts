import { parse } from 'yaml';
import { fieldAt } from '../../../../../../scripts/json/fields.mts';

export type WorkflowStep = {
  readonly id?: string;
  readonly name?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly if?: string;
  readonly shell?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly with?: Readonly<Record<string, string>>;
  readonly 'working-directory'?: string;
  readonly 'continue-on-error'?: true;
};

export type ActionDefinition = {
  readonly runs: { readonly using: string; readonly steps: readonly WorkflowStep[] };
  readonly inputs: Readonly<
    Record<string, { readonly default?: unknown; readonly description?: unknown }>
  >;
  readonly outputs: Readonly<Record<string, { readonly value: string }>>;
};

export type WorkflowJob = {
  readonly if?: string;
  readonly needs?: string;
  readonly steps: readonly WorkflowStep[];
  readonly permissions?: unknown;
  readonly 'timeout-minutes'?: number;
  readonly strategy?: { readonly matrix: { readonly os: readonly string[] } };
  readonly defaults?: { readonly run: { readonly shell: string } };
};

export type WorkflowDefinition = {
  readonly on: unknown;
  readonly permissions: unknown;
  readonly jobs: Readonly<Record<string, WorkflowJob>>;
};

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

function isActionDefinition(value: unknown): value is ActionDefinition {
  return (
    Array.isArray(fieldAt(value, 'runs', 'steps')) &&
    isObject(fieldAt(value, 'inputs')) &&
    isObject(fieldAt(value, 'outputs'))
  );
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  return isObject(fieldAt(value, 'jobs')) && isObject(fieldAt(value, 'on'));
}

export function parseAction(text: string): ActionDefinition {
  const parsed: unknown = parse(text);
  if (!isActionDefinition(parsed)) {
    throw new Error('The text is not an action definition');
  }
  return parsed;
}

export function parseWorkflow(text: string): WorkflowDefinition {
  const parsed: unknown = parse(text);
  if (!isWorkflowDefinition(parsed)) {
    throw new Error('The text is not a workflow definition');
  }
  return parsed;
}

export function jobNamed(workflow: WorkflowDefinition, name: string): WorkflowJob {
  const job = workflow.jobs[name];
  if (job === undefined) {
    throw new Error(`The workflow has no job ${name}`);
  }
  return job;
}

export function stepWhere(
  steps: readonly WorkflowStep[],
  matches: (step: WorkflowStep) => boolean,
): WorkflowStep {
  const step = steps.find(matches);
  if (step === undefined) {
    throw new Error('No step matches');
  }
  return step;
}

export function stepWithId(steps: readonly WorkflowStep[], id: string): WorkflowStep {
  return stepWhere(steps, (step) => step.id === id);
}

export function scriptOf(step: WorkflowStep | undefined): string {
  const script = step?.with?.['script'];
  if (script === undefined) {
    throw new Error('The step has no script input');
  }
  return script;
}

export function runnable(step: WorkflowStep): { readonly run: string } {
  if (step.run === undefined) {
    throw new Error('The step has no script');
  }
  return { run: step.run };
}
