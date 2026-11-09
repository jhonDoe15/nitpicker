import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowsDirectory = path.resolve(import.meta.dirname, '../../.github/workflows');
const labeled = readdirSync(workflowsDirectory)
  .filter((name) => name.endsWith('.yml'))
  .map((name) => ({
    name,
    parsed: parse(readFileSync(path.join(workflowsDirectory, name), 'utf8')),
  }))
  .filter(({ parsed }) => parsed.on?.pull_request?.types?.includes('labeled'));

const RUN_CI = "github.event_name != 'pull_request' || github.event.label.name == 'run-ci'";
const ACCEPT = "github.event.label.name == 'accept-policy-change'";

function expression(text) {
  return `\${{ ${text} }}`;
}

function renamed(job, runs) {
  return expression(`(${runs}) && '${job}' || '${job} (no CI on this label)'`);
}

const checks = labeled.flatMap(({ name, parsed }) =>
  Object.entries(parsed.jobs)
    .filter(([, job]) => String(job.if).includes('always()'))
    .map(([id, job]) => [`${name} ${id}`, id, job]),
);

describe('the summary checks of workflows that run on a label', () => {
  it('are one per workflow that has a summary job', () => {
    expect(checks.map(([id]) => id)).toEqual([
      'go-e2e.yml go-e2e',
      'java-e2e.yml java',
      'kotlin-e2e.yml kotlin',
      'platforms.yml platforms',
      'python-e2e.yml python-e2e',
      'typescript.yml test',
    ]);
  });

  it.each(checks)('%s: takes another name on a label other than run-ci', (_, id, job) => {
    expect([job.name, job.if]).toEqual([
      renamed(id, RUN_CI),
      expression(`always() && (${RUN_CI})`),
    ]);
  });

  it('runs the self-gate on run-ci and accept-policy-change, under another name on other labels', () => {
    const gate = labeled.find(({ name }) => name === 'typescript.yml').parsed.jobs['self-gate'];
    const runs = `${RUN_CI} || ${ACCEPT}`;

    expect([gate.name, gate.if]).toEqual([
      renamed('self-gate', runs),
      `github.ref != 'refs/heads/main' && (${runs})`,
    ]);
  });
});
