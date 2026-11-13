import { directWriter } from '../../../../core/fix/engine/writer.mjs';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { linkSentence } from '../../../../shared/messages/test-support/link-sentence.mjs';
import { spawnInvocation } from '../../../../core/fix/run-fix.mts';
import { resolveHeadPolicy } from '../../preset/head-policy.mjs';
import { resolveLayoutFor } from '../../preset/layout.mjs';
import project from './fixtures/project.json' with { type: 'json' };
import { knipFixStep } from './knip-fix-step.mts';
import { knipFixTypes } from './knip-fix-types.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-knip-fix-test-'));
  roots.push(root);
  for (const [name, text] of Object.entries(project)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

function fix(root, names, selectedRules = []) {
  const policy = resolveHeadPolicy();
  return knipFixStep(
    {
      projectRoot: root,
      writer: directWriter(root),
      layout: resolveLayoutFor(policy),
      knipSettings: policy.tools?.knip,
      policyEnvironment: {},
      executeFixCommand: (invocation) => spawnInvocation(invocation),
      selectedRules,
    },
    names.map((name) => ({ path: name })),
  );
}

const read = (root, name) => readFileSync(path.join(root, name), 'utf8');

describe('knipFixTypes', () => {
  it('fixes only dependencies by default, because a dropped export leaves an unused declaration', () => {
    expect(knipFixTypes([])).toEqual(['dependencies']);
  });

  it('maps each selected dead-code rule to its knip fix type', () => {
    expect(knipFixTypes(['dead-code/files', 'dead-code/types', 'eslint-lint/no-empty'])).toEqual([
      'types',
      'files',
    ]);
    expect(knipFixTypes(['dead-code/unused-dependency'])).toEqual(['dependencies']);
    expect(knipFixTypes(['eslint-lint/no-empty'])).toEqual([]);
  });
});

describe('knipFixStep', () => {
  it('drops unused exports and types only when their rules are selected', () => {
    const root = createProject();
    expect(fix(root, ['src/lib.ts'])).toEqual({ toolErrors: [], notes: [] });
    expect(read(root, 'src/lib.ts')).toBe(project['src/lib.ts']);

    const result = fix(root, ['src/lib.ts'], ['dead-code/exports', 'dead-code/types']);

    expect(result).toEqual({ toolErrors: [], notes: ['knip --fix rewrote src/lib.ts'] });
    expect(read(root, 'src/lib.ts')).toBe(
      'export function used(): number {\n  return 1;\n}\nfunction spare(): number {\n  return 2;\n}\ntype Spare = { a: number };\n',
    );
    expect(read(root, 'package.json')).toBe(project['package.json']);
    expect(existsSync(path.join(root, 'src/orphan.ts'))).toBe(true);
    expect(readdirNames(root)).toEqual(['package.json', 'src', 'tsconfig.json']);
  });

  it('removes an unused dependency from a changed package.json and keeps its indentation', () => {
    const root = createProject();
    const result = fix(root, ['package.json']);

    expect(result.notes).toEqual(['knip --fix rewrote package.json']);
    expect(read(root, 'package.json')).toBe(
      '{\n    "name": "sample",\n    "type": "module",\n    "dependencies": {}\n}\n',
    );
    expect(read(root, 'src/lib.ts')).toBe(project['src/lib.ts']);
  });

  it('keeps a package.json that has no final newline without one', () => {
    const root = createProject();
    writeFileSync(path.join(root, 'package.json'), project['package.json'].trimEnd());

    fix(root, ['package.json']);

    expect(read(root, 'package.json').endsWith('}')).toBe(true);
  });

  it('leaves unused files alone unless dead-code/files is selected', () => {
    const root = createProject();

    expect(fix(root, ['src/orphan.ts']).notes).toEqual([]);
    expect(existsSync(path.join(root, 'src/orphan.ts'))).toBe(true);

    const deleted = fix(root, ['src/orphan.ts'], ['dead-code/files']);

    expect(deleted.notes).toEqual(['knip --fix deleted src/orphan.ts']);
    expect(existsSync(path.join(root, 'src/orphan.ts'))).toBe(false);
    expect(existsSync(path.join(root, 'src/untouched.ts'))).toBe(true);
  });

  it('does nothing when only other rules are selected', () => {
    const root = createProject();

    expect(fix(root, ['src/lib.ts'], ['eslint-lint/no-empty'])).toEqual({
      toolErrors: [],
      notes: [],
    });
    expect(read(root, 'src/lib.ts')).toBe(project['src/lib.ts']);
  });

  it('reports a knip failure as a tool error', () => {
    const root = createProject();
    const failing = knipFixStep(
      {
        projectRoot: root,
        layout: resolveLayoutFor(resolveHeadPolicy()),
        policyEnvironment: {},
        executeFixCommand: () => ({ status: 2, stdout: '', stderr: 'boom' }),
        selectedRules: ['dead-code/exports'],
      },
      [{ path: 'src/lib.ts' }],
    );

    expect(failing.toolErrors).toEqual([
      {
        tool: 'knip-fix',
        snapshot: 'fix',
        message: `knip-fix failed: boom. ${linkSentence('fixersFail')}`,
      },
    ]);
  });
});

function readdirNames(root) {
  return readdirSync(root).toSorted();
}
