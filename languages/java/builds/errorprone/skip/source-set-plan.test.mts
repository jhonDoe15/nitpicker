import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { argumentSetOf } from '../engine-arguments.mts';
import { ENABLED_CHECKS } from './runner-checks.mts';
import {
  checksOff,
  NARROWED,
  plannedArguments,
  planLine,
  remainingChecks,
  sourceSetPlan,
} from './source-set-plan.mts';

const projectWith = useTempProjects('nitpicker-errorprone-plan-');

function setIn(root: string, ...head: readonly string[]) {
  const own = path.join(root, 'classes');
  mkdirSync(path.join(own, 'demo'), { recursive: true });
  writeFileSync(path.join(own, 'demo/A.class'), '');
  const sources = ['A.java', 'B.java', 'quiet/C.java'].map((name) => path.join(root, name));
  return argumentSetOf([`--own-classes=${own}`, ...head, '--sources', ...sources, ''].join('\n'));
}

function project() {
  return projectWith({
    'A.java': 'class A {}',
    'B.java': 'class B {}',
    'quiet/C.java': 'class C {}',
    'quiet/lombok.config': 'lombok.addSuppressWarnings = false\n',
  });
}

describe('remainingChecks', () => {
  it('lists what the runner runs and the engine does not: NullAway on main sources, project checks', () => {
    const set = setIn(
      project(),
      '--errorprone-flag=-Xep:Extra:WARN',
      '--errorprone-flag=-Xep:FallThrough:OFF',
    );
    const onEngine = ENABLED_CHECKS.filter(
      (check) => !['FallThrough', 'SwitchDefault', 'Immutable'].includes(check),
    );

    expect(remainingChecks(set, onEngine)).toStrictEqual(['Extra', 'NullAway', 'SwitchDefault']);
    expect(remainingChecks(setIn(project(), '--test-only'), onEngine)).toStrictEqual([
      'FallThrough',
      'SwitchDefault',
    ]);
  });

  it('keeps Immutable when its annotation can be in reach or the project turns it on', () => {
    const root = project();
    writeFileSync(
      path.join(root, 'B.java'),
      '@com.google.errorprone.annotations.Immutable class B {}',
    );
    const onEngine = ENABLED_CHECKS.filter((check) => check !== 'Immutable');

    expect(remainingChecks(setIn(root, '--test-only'), onEngine)).toStrictEqual(['Immutable']);
    expect(remainingChecks(setIn(project(), '--test-only'), onEngine)).toStrictEqual([]);
    expect(
      remainingChecks(
        setIn(project(), '--test-only', '--errorprone-flag=-Xep:Immutable:WARN'),
        onEngine,
      ),
    ).toStrictEqual(['Immutable']);
  });
});

describe('sourceSetPlan', () => {
  it('starts no Error Prone when no check it still needs may report in any file', () => {
    const set = setIn(project());

    const answered = new Map(set.sources.map((file) => [file, []]));

    expect(sourceSetPlan(set, ['FallThrough'], answered)).toStrictEqual({ kind: 'none' });
    expect(
      plannedArguments(set, { kind: 'none' }, ['-Xep:A:OFF']).split('\n').slice(-3),
    ).toStrictEqual(['--errorprone-flag=-Xep:A:OFF', '--sources', '']);
    expect(planLine('main', set, { kind: 'none' })).toBe(
      'nitpicker: Error Prone does not compile main: the engine ran every check that can report there\n',
    );
  });

  it('narrows to the files and checks that may report, with the Lombok checks off where the runner has them off', () => {
    const set = setIn(project());
    const [a = '', b = '', c = ''] = set.sources;
    const mayReport = new Map([
      [a, ['FallThrough', 'NotAsked']],
      [b, []],
      [c, ['StatementSwitchToExpressionSwitch']],
    ]);
    const plan = sourceSetPlan(
      set,
      ['FallThrough', 'StatementSwitchToExpressionSwitch'],
      mayReport,
    );

    expect(plan).toStrictEqual({ kind: 'narrowed', files: [a], checks: ['FallThrough'] });
    expect(plannedArguments(set, plan, []).split('\n').slice(-4)).toStrictEqual([
      NARROWED,
      '--sources',
      a,
      '',
    ]);
    const everywhere = sourceSetPlan(
      set,
      ['FallThrough'],
      new Map([a, b, c].map((file) => [file, ['FallThrough']])),
    );
    expect(plannedArguments(set, everywhere, []).split('\n')).not.toContain(NARROWED);
  });

  it('gives a file the engine did not answer for every remaining check', () => {
    const set = setIn(project());
    const [a = '', b = '', c = ''] = set.sources;

    expect(
      sourceSetPlan(
        set,
        ['FallThrough'],
        new Map([
          [a, []],
          [c, []],
        ]),
      ),
    ).toStrictEqual({
      kind: 'narrowed',
      files: [b],
      checks: ['FallThrough'],
    });
  });

  it('turns off every check the plan does not need, except the one Error Prone refuses to turn off', () => {
    const plan = { kind: 'narrowed', files: [], checks: ['FallThrough'] } as const;
    const off = checksOff(
      plan,
      ['FallThrough', 'Extra'],
      ['UnicodeDirectionalityCharacters', 'SystemOut'],
    );

    expect(off).toContain('SystemOut');
    expect(off).toContain('Extra');
    expect(off).toContain('Immutable');
    expect(off).toContain('NullAway');
    expect(off).not.toContain('FallThrough');
    expect(off).not.toContain('UnicodeDirectionalityCharacters');
  });
});
