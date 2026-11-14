import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pinnedPytestArguments } from '../pytest-pins.mjs';
import { projectRetries, readPytestRetries, retriesNotices } from './pytest-retries.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-pytest-retries-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) writeFileSync(path.join(root, file), text);
  return root;
}

const OPT_IN = { toolPrecedence: { tests: ['project', 'nitpicker'] } };
const OPT_IN_NOTICE =
  'Ignoring reruns in pytest.ini; opt in with "tools": { "tests": { "precedence": ["project", "nitpicker"] } }';

describe('the retries a pytest config sets', () => {
  it('reads the ini options of pytest-rerunfailures and pytest-retry', () => {
    const root = project({
      'pytest.ini': '[pytest]\nreruns = 3\nreruns_delay = 0.5\nretries = 2\nretry_delay = 1\n',
    });

    expect(readPytestRetries(root)).toEqual({
      file: 'pytest.ini',
      values: { reruns: 3, reruns_delay: expect.closeTo(0.5), retries: 2, retry_delay: 1 },
    });
  });

  it('reads pyproject tables and the flags of addopts, which win over the ini option', () => {
    const root = project({
      'pyproject.toml':
        '[tool.pytest.ini_options]\nreruns = 1\naddopts = "-ra --reruns 4 --retry-delay=2"\n',
    });

    expect(readPytestRetries(root).values).toEqual({ reruns: 4, retry_delay: 2 });
  });

  it('finds nothing when the config sets no retry', () => {
    expect(
      readPytestRetries(project({ 'pytest.ini': '[pytest]\naddopts = -ra\n' })).values,
    ).toEqual({});
    expect(readPytestRetries(project({})).values).toEqual({});
  });

  it.each([
    ['reruns = 11', 'reruns in pytest.ini is "11": it must be a whole number from 0 to 10'],
    ['retries = 1.5', 'retries in pytest.ini is "1.5": it must be a whole number from 0 to 10'],
    [
      'reruns_delay = 61',
      'reruns_delay in pytest.ini is "61": it must be a number of seconds from 0 to 60',
    ],
    ['reruns = many', 'reruns in pytest.ini is "many": it must be a whole number from 0 to 10'],
  ])('rejects %s', (line, message) => {
    expect(() => readPytestRetries(project({ 'pytest.ini': `[pytest]\n${line}\n` }))).toThrow(
      message,
    );
  });
});

describe('opting into the retries of the project', () => {
  const files = { 'pytest.ini': '[pytest]\nreruns = 3\nreruns_delay = 1\n' };

  it.each([[['nitpicker']], [['nitpicker', 'project']], [undefined]])(
    'ignores the config with the ordering %j',
    (precedence) => {
      const root = project(files);

      expect(projectRetries({ projectRoot: root, toolPrecedence: { tests: precedence } })).toBe(
        undefined,
      );
    },
  );

  it.each([[['project']], [['project', 'nitpicker']]])(
    'reads the config of the head checkout with the ordering %j',
    (precedence) => {
      const head = project(files);
      const base = project({ 'pytest.ini': '[pytest]\nreruns = 9\n' });

      expect(
        projectRetries({
          projectRoot: base,
          policyRoot: head,
          toolPrecedence: { tests: precedence },
        }),
      ).toEqual({ reruns: 3, reruns_delay: 1 });
    },
  );

  it('is a tool error to name the project without a retry to read', () => {
    const root = project({ 'pytest.ini': '[pytest]\naddopts = -ra\n' });

    expect(() => projectRetries({ projectRoot: root, ...OPT_IN })).toThrow(
      '"tools.tests.precedence" lists "project" but reruns, reruns_delay, retries or retry_delay in a pytest config',
    );
  });

  it('passes the values of the project instead of switching the retries off', () => {
    const root = project(files);
    const probe = { rerunfailures: true, retry: true };

    expect(pinnedPytestArguments(root, probe)).toEqual(['-o', 'reruns=0', '-o', 'retries=0']);
    expect(pinnedPytestArguments(root, probe, { reruns: 3, reruns_delay: 1 })).toEqual([
      '-o',
      'reruns=3',
      '-o',
      'reruns_delay=1',
      '-o',
      'retries=0',
    ]);
    expect(pinnedPytestArguments(root, { rerunfailures: false }, { reruns: 3 })).toEqual([]);
  });

  it('says what it ignored, once, without the opt-in and only when a retry is set', () => {
    const root = project(files);
    const quiet = project({ 'pytest.ini': '[pytest]\nreruns = 0\n' });

    expect(retriesNotices({ config: {}, projectRoot: root })).toEqual([OPT_IN_NOTICE]);
    expect(retriesNotices({ config: {}, projectRoot: quiet })).toEqual([]);
    expect(
      retriesNotices({
        config: { tools: { tests: { precedence: ['project'] } } },
        projectRoot: root,
      }),
    ).toEqual([]);
    expect(
      retriesNotices({
        config: { tools: { tests: { precedence: ['nitpicker', 'project'] } } },
        projectRoot: root,
      }),
    ).toEqual([]);
  });
});
