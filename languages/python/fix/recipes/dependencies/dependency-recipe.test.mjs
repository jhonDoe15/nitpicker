import { describe, expect, it } from 'vitest';
import { pythonDependenciesRecipe as recipe } from './dependency-recipe.mjs';

const PYPROJECT = `[project]
name = "demo"
dependencies = [
    "requests>=2",
    "yaml-tools",
]

[dependency-groups]
dev = [
    "pytest>=8",
]
`;

function finding(rule, identity, extra = {}) {
  return { tool: 'dependencies', rule, path: 'pyproject.toml', identity, ...extra };
}

function plan(findings, { text = PYPROJECT, versions = {} } = {}) {
  return recipe.plan({
    read: (name) => (name === 'pyproject.toml' ? text : undefined),
    inputs: { pythonDependencies: { findings, versions } },
  });
}

function result(text, planned) {
  const edits = planned.fixes
    .flatMap(({ edits: list }) => list)
    .sort((left, right) => right.start - left.start);
  return edits.reduce(
    (out, edit) => out.slice(0, edit.start) + edit.text + out.slice(edit.end),
    text,
  );
}

describe('pythonDependenciesRecipe', () => {
  it('is a review recipe of project scope that may edit only pyproject.toml', () => {
    expect([recipe.safety, recipe.scope, recipe.presets]).toEqual([
      'review',
      'project',
      ['python'],
    ]);
    expect([recipe.accepts('pyproject.toml'), recipe.accepts('requirements.txt')]).toEqual([
      true,
      false,
    ]);
    expect(recipe.rules.map(({ rule }) => rule)).toEqual([
      'unused-dependency',
      'unlisted-dependency',
      'no-dev-dependency-in-production',
    ]);
  });

  it('adds an unlisted dependency with the installed version, once for many files', () => {
    const planned = plan(
      [
        finding('unlisted-dependency', 'unlisted:httpx', { path: 'src/a.py', test: true }),
        finding('unlisted-dependency', 'unlisted:httpx', { path: 'src/b.py', test: false }),
      ],
      { versions: { httpx: '0.27.0' } },
    );

    expect(planned.fixes).toHaveLength(1);
    expect(planned.fixes[0].finding).toEqual({
      tool: 'dependencies',
      rule: 'unlisted-dependency',
      path: 'src/b.py',
      line: 1,
    });
    expect(result(PYPROJECT, planned)).toBe(
      PYPROJECT.replace('    "yaml-tools",\n', '    "yaml-tools",\n    "httpx>=0.27.0",\n'),
    );
  });

  it('adds a dependency only tests import to the development group', () => {
    const planned = plan([finding('unlisted-dependency', 'unlisted:respx', { test: true })], {
      versions: { respx: '0.21' },
    });

    expect(result(PYPROJECT, planned)).toBe(
      PYPROJECT.replace('    "pytest>=8",\n', '    "pytest>=8",\n    "respx>=0.21",\n'),
    );
  });

  it('declines when the installed version is unknown, and says so', () => {
    const planned = plan([finding('unlisted-dependency', 'unlisted:httpx')]);

    expect(planned.fixes).toEqual([]);
    expect(planned.notes).toEqual([
      '--fix could not fix unlisted-dependency for httpx: its installed version could not be read',
    ]);
  });

  it('declines when the installed version needs a newer Python than the project allows', () => {
    const planned = plan([finding('unlisted-dependency', 'unlisted:httpx')], {
      versions: { httpx: null },
    });

    expect(planned.fixes).toEqual([]);
    expect(planned.notes).toEqual([
      '--fix could not fix unlisted-dependency for httpx: its installed version needs a newer Python than requires-python allows',
    ]);
  });

  it('removes an unused production dependency and names one it cannot find', () => {
    const planned = plan([
      finding('unused-dependency', 'unused:yaml-tools', { location: { line: 5 } }),
      finding('unused-dependency', 'unused:missing'),
    ]);

    expect(result(PYPROJECT, planned)).toBe(PYPROJECT.replace('    "yaml-tools",\n', ''));
    expect(planned.fixes[0].finding.line).toBe(5);
    expect(planned.notes).toEqual([
      '--fix could not fix unused-dependency for missing: pyproject.toml does not declare it as a project dependency',
    ]);
  });

  it('leaves a dependency listed in another manifest', () => {
    const planned = plan([finding('unused-dependency', 'unused:x', { path: 'requirements.txt' })]);

    expect(planned.fixes).toEqual([]);
    expect(planned.notes).toEqual([
      '--fix could not fix unused-dependency for x: only pyproject.toml is edited, and the dependency is listed in requirements.txt',
    ]);
  });

  it('moves a development dependency that production code imports', () => {
    const planned = plan([
      finding('no-dev-dependency-in-production', 'dev-only:pytest', { path: 'src/a.py' }),
    ]);

    expect(result(PYPROJECT, planned)).toBe(
      PYPROJECT.replace('    "yaml-tools",\n', '    "yaml-tools",\n    "pytest>=8",\n').replace(
        'dev = [\n    "pytest>=8",\n]',
        'dev = [\n]',
      ),
    );
  });

  it('plans nothing without findings or a pyproject.toml', () => {
    expect(plan([]).fixes).toEqual([]);
    expect(plan([finding('unused-dependency', 'unused:x')], { text: undefined }).fixes).toEqual([]);
    expect(recipe.plan({ read: () => PYPROJECT, inputs: {} }).fixes).toEqual([]);
  });

  it('adds nothing for a dependency that is already declared', () => {
    expect(
      plan([finding('unlisted-dependency', 'unlisted:requests')], { versions: { requests: '2' } })
        .fixes,
    ).toEqual([]);
  });
});
