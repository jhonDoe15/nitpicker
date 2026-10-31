import { afterAll, describe, expect, it } from 'vitest';
import {
  headPolicyFor,
  lintLayered,
  PROJECT_FILES,
  SOURCES,
  temporaryProjects,
} from './test-support/layered-project.mjs';

const projects = temporaryProjects();
const root = projects.create({ ...SOURCES, ...PROJECT_FILES });

const ALWAYS = [
  { file: 'src/console.ts', ruleId: 'nitpicker/no-foo', line: 2 },
  { file: 'src/loose.ts', ruleId: 'directive', line: 1 },
  { file: 'src/params.ts', ruleId: 'max-params', line: 1 },
  { file: 'src/strict/locked.ts', ruleId: 'directive', line: 1 },
];
const NITPICKER_CONSOLE = [
  { file: 'src/console.ts', ruleId: 'no-console', line: 1 },
  { file: 'src/strict/locked.ts', ruleId: 'no-console', line: 2 },
];
const PROJECT_RULES = [
  { file: 'src/equal.ts', ruleId: 'eqeqeq', line: 1 },
  { file: 'src/named.ts', ruleId: 'house/no-bar', line: 1 },
];

function sorted(findings) {
  return findings.toSorted(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      String(left.ruleId).localeCompare(String(right.ruleId)),
  );
}

function lint(engine, precedence) {
  return sorted(
    lintLayered({
      projectRoot: root,
      policy: headPolicyFor({ engine, precedence, liveProjectRoot: root }),
    }),
  );
}

afterAll(() => {
  projects.remove();
});

describe.each(['eslint', 'oxlint'])('the ESLint project config on %s', (engine) => {
  it('is not read without the opt-in', () => {
    expect(lint(engine, undefined)).toEqual(
      sorted([
        ...ALWAYS,
        ...NITPICKER_CONSOLE,
        { file: 'src/generated/generated.ts', ruleId: 'no-console', line: 1 },
      ]),
    );
  });

  it('with the project first takes its options for nitpicker rules, adds its rules and ignores, and switches nothing off', () => {
    expect(lint(engine, ['project', 'nitpicker'])).toEqual(sorted([...ALWAYS, ...PROJECT_RULES]));
  });

  it('with nitpicker first keeps nitpicker settings and adds the project rules and ignores', () => {
    expect(lint(engine, ['nitpicker', 'project'])).toEqual(
      sorted([...ALWAYS, ...NITPICKER_CONSOLE, ...PROJECT_RULES]),
    );
  });
});
