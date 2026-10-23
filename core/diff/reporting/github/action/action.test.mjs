import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { CI_TARGET_VARIABLES } from '../../../git/repository/base-ref.mjs';

const repositoryRoot = path.join(import.meta.dirname, '../../../../..');

function readText(relativePath) {
  return readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

const actionText = readText('action.yml');
const action = parse(actionText);
const steps = action.runs.steps;
const workflow = parse(readText('.github/workflows/github-action.yml'));
const docs = readText('docs/ci.md');

const FULL_VERSION_TAG = /^[\w.-]+\/[\w./-]+@v\d+\.\d+\.\d+$/u;

function stepNamed(prefix) {
  return steps.find((step) => step.name?.startsWith(prefix));
}

function scriptLines(step, fragment) {
  return step.run.split('\n').filter((line) => line.includes(fragment));
}

describe('action.yml', () => {
  it('is a composite action', () => {
    expect(action.runs.using).toBe('composite');
  });

  it('declares every input it reads, each with a default and a description', () => {
    const read = [...actionText.matchAll(/inputs\.([a-z-]+)/gu)].map(([, name]) => name);
    const inputs = Object.values(action.inputs);

    expect(new Set(read)).toEqual(new Set(Object.keys(action.inputs)));
    expect(inputs.map((input) => typeof input.default)).toEqual(inputs.map(() => 'string'));
    expect(inputs.map((input) => typeof input.description)).toEqual(inputs.map(() => 'string'));
  });

  it('never puts an input or event value into a script', () => {
    const scripts = steps.flatMap((step) => (step.run === undefined ? [] : [step.run]));

    expect(scripts.filter((script) => script.includes('${{'))).toEqual([]);
  });

  it('pins every action to a full version tag', () => {
    const used = steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]));

    expect(used.filter((reference) => !FULL_VERSION_TAG.test(reference))).toEqual([]);
  });

  it('exposes outputs that name a step which exists', () => {
    const ids = steps.flatMap((step) => (step.id === undefined ? [] : [step.id]));
    const named = Object.values(action.outputs).map(
      (output) => /steps\.([\w-]+)\.outputs\./u.exec(output.value)?.[1],
    );

    expect(named.filter((id) => !ids.includes(id))).toEqual([]);
  });

  it('keeps the policy acceptance behind an input and never sets a digest', () => {
    const gate = stepNamed('Run the gate');

    expect(gate.env.NITPICKER_ACCEPT_POLICY_CHANGE).toBe('${{ inputs.accept-policy-change }}');
    expect(action.inputs['accept-policy-change'].default).toBe('');
  });

  it('runs the project own nitpicker from the working directory', () => {
    const gate = stepNamed('Run the gate');

    expect(gate['working-directory']).toBe('${{ inputs.working-directory }}');
    expect(scriptLines(gate, 'npx')).toEqual([
      '  runner=(npx --yes "$PACKAGE")',
      '  runner=(npx --no-install nitpicker)',
    ]);
  });

  it('publishes only where the comparison is skipped, on the default branch', () => {
    const publish = stepNamed('Publish');

    expect(publish.if).toBe(
      "${{ steps.prepare.outputs.skip-gate == 'true' && inputs.cache-publish == 'true' }}",
    );
    expect(scriptLines(publish, 'cache publish')).toEqual([
      '  npx --yes "$PACKAGE" cache publish',
      '  npx --no-install nitpicker cache publish',
    ]);
  });
});

describe('the sample workflow', () => {
  const job = workflow.jobs['sample-project'];

  it('follows the triggers of the other workflows and is not a pull request check', () => {
    expect([
      workflow.on.push.branches,
      workflow.on.pull_request.types,
      workflow.on.workflow_dispatch,
      workflow.permissions,
    ]).toEqual([['main'], ['labeled'], null, { contents: 'read' }]);
    expect(job.if).toBe(
      "github.event_name != 'pull_request' || github.event.label.name == 'run-ci'",
    );
    expect(job['timeout-minutes']).toBe(20);
  });

  it('uses the action of this repository on the sample project', () => {
    const use = job.steps.find((step) => step.uses === './');

    expect(use['continue-on-error']).toBe(true);
    expect(use.with['working-directory']).toBe('.github/sample-project');
  });

  it('pins the actions it uses to full version tags', () => {
    const used = job.steps.flatMap((step) => (step.uses === undefined ? [] : [step.uses]));

    expect(
      used.filter((reference) => reference !== './' && !FULL_VERSION_TAG.test(reference)),
    ).toEqual([]);
  });
});

describe('docs/ci.md', () => {
  it('documents every input and output of the action', () => {
    const names = [...Object.keys(action.inputs), ...Object.keys(action.outputs)];

    expect(names.filter((name) => !docs.includes(`\`${name}\``))).toEqual([]);
  });

  it('names every CI variable that picks the base', () => {
    expect(CI_TARGET_VARIABLES.filter((variable) => !docs.includes(variable))).toEqual([]);
  });

  it('pins the actions in its examples to full version tags, and the action to main', () => {
    const references = [...docs.matchAll(/uses: ([\w.-]+\/[\w./-]+)@(\S+)/gu)];
    const others = references.filter(([, name]) => name !== 'jhonDoe15/nitpicker');
    const own = references.filter(([, name]) => name === 'jhonDoe15/nitpicker');

    expect(others.filter(([, , version]) => !/^v\d+\.\d+\.\d+$/u.test(version))).toEqual([]);
    expect(new Set(own.map(([, , version]) => version))).toEqual(new Set(['main']));
  });
});
