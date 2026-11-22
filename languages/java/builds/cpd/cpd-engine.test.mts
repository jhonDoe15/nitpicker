import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../shared/test-support/temp-projects.mts';
import type { EngineStart } from '../../../../shared/engine/engine-run.mts';
import { CPD_ENGINE_LOG, cpdOnEngine, cpdPlanOf, environmentOf } from './cpd-engine.mts';

const projectWith = useTempProjects('nitpicker-cpd-engine-');

function setup() {
  const root = projectWith({});
  const binary = path.join(root, 'nitpicker-engine');
  writeFileSync(binary, '');
  const report = path.join(root, 'cpd.xml');
  writeFileSync(report, 'stale');
  return {
    plan: { report, directories: [path.join(root, 'src')] },
    environment: { NITPICKER_ENGINE: binary },
    log: path.join(root, CPD_ENGINE_LOG),
  };
}

const writing: EngineStart = (argumentList) => {
  writeFileSync(String(argumentList[2]), '<pmd-cpd/>');
  return { status: 0, stdout: '', stderr: '' };
};

describe('cpdOnEngine', () => {
  it('lets the engine write cpd.xml and notes that it did', () => {
    const { plan, environment, log } = setup();
    const calls: (readonly string[])[] = [];
    const run: EngineStart = (argumentList, options) => {
      calls.push(argumentList);
      return writing(argumentList, options);
    };
    expect(cpdOnEngine(plan, environment, { run })).toBe(true);
    expect(calls).toEqual([['cpd', '--report', plan.report, ...plan.directories]]);
    expect(readFileSync(plan.report, 'utf8')).toBe('<pmd-cpd/>');
    expect(readFileSync(log, 'utf8')).toBe('the engine wrote this report\n');
  });

  it('leaves the module to CPD when the engine declines it', () => {
    const { plan, environment, log } = setup();
    const written: string[] = [];
    const run: EngineStart = () => ({ status: 3, stdout: '', stderr: 'symbolic link a\n' });
    const accepted = cpdOnEngine(plan, environment, {
      run,
      log: { write: (text) => written.push(text) },
    });
    expect(accepted).toBe(false);
    expect(existsSync(plan.report)).toBe(false);
    expect(readFileSync(log, 'utf8')).toBe('CPD runs: symbolic link a\n');
    expect(written).toEqual([
      'nitpicker: the engine did not look for duplicates, PMD CPD does: symbolic link a\n',
    ]);
  });

  it('does not call the engine when it is switched off', () => {
    const { plan } = setup();
    const run: EngineStart = () => {
      throw new Error('not called');
    };
    expect(cpdOnEngine(plan, { NITPICKER_ENGINE: 'off' }, { run })).toBe(false);
    expect(existsSync(plan.report)).toBe(false);
  });

  it('reads the plan and the environment it is given', () => {
    expect(cpdPlanOf({ report: 'r.xml', directories: ['a', 'b'] })).toEqual({
      report: 'r.xml',
      directories: ['a', 'b'],
    });
    expect(environmentOf({ A: 'x', B: 1 })).toEqual({ A: 'x', B: undefined });
    expect(environmentOf(undefined)).toEqual({});
  });
});
