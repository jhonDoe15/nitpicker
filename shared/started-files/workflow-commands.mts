import path from 'node:path';
import { isRecord } from '../rules/facts/checks.mts';
import { parseWithModule } from '../values/parse-module.mts';
import { fieldOf, listOf } from '../values/readers.mts';

type WorkflowCommand = { readonly command: string; readonly directory: string };

function defaultDirectory(holder: unknown): string | undefined {
  const directory = fieldOf(fieldOf(fieldOf(holder, 'defaults'), 'run'), 'working-directory');
  return typeof directory === 'string' ? directory : undefined;
}

function stepCommands(step: unknown, fallback: string | undefined): WorkflowCommand[] {
  if (!isRecord(step) || typeof step['run'] !== 'string') {
    return [];
  }
  const directory = step['working-directory'];
  const where = typeof directory === 'string' ? directory : fallback;
  return [
    { command: step['run'], directory: path.posix.normalize(where ?? '.').replace(/^\.$/u, '') },
  ];
}

function parseWorkflow(text: string): { readonly workflow: unknown } | { readonly kind: string } {
  try {
    return { workflow: parseWithModule('yaml', text) };
  } catch {
    return { kind: 'malformed-yaml' };
  }
}

export function workflowCommands(text: string): WorkflowCommand[] {
  const parsed = parseWorkflow(text);
  if (!('workflow' in parsed)) {
    return [];
  }
  const { workflow } = parsed;
  const jobsField = fieldOf(workflow, 'jobs');
  const jobs = isRecord(jobsField) ? Object.values(jobsField) : [];
  return jobs.filter(isRecord).flatMap((job) => {
    const fallback = defaultDirectory(job) ?? defaultDirectory(workflow);
    const steps = listOf(job['steps']);
    return steps.flatMap((step) => stepCommands(step, fallback));
  });
}
