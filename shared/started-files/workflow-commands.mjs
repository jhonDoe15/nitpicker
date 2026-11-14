import { createRequire } from 'node:module';
import path from 'node:path';
import { isRecord } from '../rules/facts/checks.mjs';

function defaultDirectory(holder) {
  const directory = holder?.defaults?.run?.['working-directory'];
  return typeof directory === 'string' ? directory : undefined;
}

function stepCommands(step, fallback) {
  if (!isRecord(step) || typeof step.run !== 'string') {
    return [];
  }
  const directory = step['working-directory'];
  const where = typeof directory === 'string' ? directory : fallback;
  return [
    { command: step.run, directory: path.posix.normalize(where ?? '.').replace(/^\.$/u, '') },
  ];
}

function parseWorkflow(text) {
  try {
    return { workflow: createRequire(import.meta.url)('yaml').parse(text) };
  } catch {
    return { kind: 'malformed-yaml' };
  }
}

export function workflowCommands(text) {
  const { workflow, kind } = parseWorkflow(text);
  if (kind !== undefined) {
    return [];
  }
  const jobs = isRecord(workflow?.jobs) ? Object.values(workflow.jobs) : [];
  return jobs.filter(isRecord).flatMap((job) => {
    const fallback = defaultDirectory(job) ?? defaultDirectory(workflow);
    const steps = Array.isArray(job.steps) ? job.steps : [];
    return steps.flatMap((step) => stepCommands(step, fallback));
  });
}
