import { describe, expect, it } from 'vitest';
import { labeledRun, selectByLabels } from './analyzer-labels.mts';

const analyzer = (name, extra = {}) => ({
  name,
  configurationHash: name,
  createInvocation: () => ({ args: ['run', name] }),
  ...extra,
});

const entries = [
  { tool: 'eslint', analyzers: { typescript: ['eslint-lint'] }, labels: ['bug', 'async'] },
  { tool: 'eslint', analyzers: { typescript: ['eslint-style'] }, labels: ['style'] },
  { tool: 'coverage', analyzers: { typescript: ['coverage'], java: ['java'] }, labels: ['tests'] },
  { tool: 'pmd', analyzers: { java: ['java'] }, labels: ['performance'] },
];

const typescript = [
  analyzer('eslint-lint', { dependencies: ['eslint-base'] }),
  analyzer('eslint-base'),
  analyzer('eslint-style'),
  analyzer('structure'),
  analyzer('coverage'),
  analyzer('mine', { custom: true }),
];

function names(selection) {
  return selection.analyzers.map(({ name }) => name);
}

function select(labelNames, analyzerNames = []) {
  return selectByLabels(typescript, { labelNames, analyzerNames, preset: 'typescript', entries });
}

describe('selectByLabels', () => {
  it('runs everything without --label', () => {
    const selection = select([]);

    expect(selection.analyzers).toBe(typescript);
    expect(selection.filter).toBeUndefined();
    expect(selection.skipped).toEqual([]);
  });

  it('runs the analyzers with a matching rule, their dependencies, custom and unknown ones', () => {
    const selection = select(['bug']);

    expect(names(selection)).toEqual(['eslint-lint', 'eslint-base', 'structure', 'mine']);
    expect(selection.skipped).toEqual(['eslint-style', 'coverage']);
    expect(selection.filter).toEqual({ kinds: ['bug'], frameworks: [] });
  });

  it('runs the test-run analyzers only when a test-run rule matches', () => {
    expect(names(select(['tests']))).toEqual(['eslint-base', 'structure', 'coverage', 'mine']);
  });

  it('keeps the analyzers named with --analyzer', () => {
    expect(names(select(['bug'], ['eslint-style']))).toEqual([
      'eslint-lint',
      'eslint-base',
      'eslint-style',
      'structure',
      'mine',
    ]);
  });

  it('runs a JVM build in quick mode when no test-run rule matches', () => {
    const java = [analyzer('java')];
    const request = { analyzerNames: [], preset: 'java', entries };

    const focused = selectByLabels(java, { ...request, labelNames: ['performance'] });
    const tested = selectByLabels(java, { ...request, labelNames: ['tests'] });

    expect(focused.analyzers[0].quick).toBe(true);
    expect(focused.analyzers[0].createInvocation({}).args).toEqual([
      'run',
      'java',
      '--mode',
      'quick',
    ]);
    expect(focused.skipped).toEqual(['tests', 'jacoco', 'crap', 'pit', 'test-runtime']);
    expect(tested.analyzers[0].quick).toBeUndefined();
  });
});

describe('labeledRun', () => {
  it('keeps the rest of the profile and names the skipped checks on stderr', () => {
    const written = [];
    const stderr = { write: (text) => written.push(text) };

    const run = labeledRun(
      { analyzers: typescript, quick: 'q' },
      { labelNames: ['bug'], analyzerNames: [], stderr, entries },
    );

    expect(run.quick).toBe('q');
    expect(run.labels).toEqual({ kinds: ['bug'], frameworks: [] });
    expect(written).toEqual([
      'nitpicker: --label bug skips the checks that cannot report it: eslint-style, coverage\n',
    ]);
  });

  it('changes nothing without --label', () => {
    const written = [];
    const profiled = { analyzers: typescript, quick: undefined };

    const run = labeledRun(profiled, {
      analyzerNames: [],
      stderr: { write: (text) => written.push(text) },
    });

    expect(run).toEqual({ ...profiled, labels: undefined });
    expect(written).toEqual([]);
  });
});
