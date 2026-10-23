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
  { file: 'src/console.ts', ruleId: 'no-console', line: 1 },
  { file: 'src/console.ts', ruleId: 'nitpicker/no-foo', line: 2 },
  { file: 'src/loose.ts', ruleId: 'directive', line: 1 },
  { file: 'src/strict/locked.ts', ruleId: 'directive', line: 1 },
  { file: 'src/strict/locked.ts', ruleId: 'no-console', line: 2 },
];
const NITPICKER_PARAMS = { file: 'src/params.ts', ruleId: 'max-params', line: 1 };
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
  it.each([[undefined], [['nitpicker']]])('is not read with precedence %j', (precedence) => {
    expect(lint(engine, precedence)).toEqual(
      sorted([
        ...ALWAYS,
        NITPICKER_PARAMS,
        { file: 'src/generated/generated.ts', ruleId: 'no-console', line: 1 },
      ]),
    );
  });

  it.each([[['project']], [['project', 'nitpicker']]])(
    'with %j takes the project rule options, adds its rules and ignores, and keeps every nitpicker rule on',
    (precedence) => {
      expect(lint(engine, precedence)).toEqual(sorted([...ALWAYS, ...PROJECT_RULES]));
    },
  );

  it('with ["nitpicker", "project"] keeps nitpicker settings and adds the project rules and ignores', () => {
    expect(lint(engine, ['nitpicker', 'project'])).toEqual(
      sorted([...ALWAYS, NITPICKER_PARAMS, ...PROJECT_RULES]),
    );
  });
});
