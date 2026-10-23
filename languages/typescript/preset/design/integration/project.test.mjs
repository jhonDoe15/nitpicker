import { afterEach, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { createProject, factsOf, findingsOf, removeProject } from '../test-support/project.mjs';

const roots = [];

function project(options) {
  const root = createProject(options);
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    removeProject(root);
  }
});

describe('the modules and packages of a project', () => {
  it('leaves out generated files and test files', () => {
    const root = project({
      files: {
        'src/real.ts': 'export const real = 1;\n',
        'src/api.generated.ts': 'export const api = 1;\n',
        'src/header.ts': '// @generated\nexport const header = 1;\n',
        'src/real.test.ts': 'export const test = 1;\n',
      },
    });

    expect(factsOf(root, { generatedFiles: ['src/api.generated.ts'] }).modules).toEqual([
      { file: 'src/real.ts', role: 'production' },
    ]);
  });

  it('marks the modules the layout names as entry points', () => {
    const root = project({
      files: { 'src/cli.ts': 'export const cli = 1;\n', 'src/lib.ts': 'export const lib = 1;\n' },
    });

    expect(factsOf(root, { layout: { entryPoints: ['src/cli.ts'] } }).modules).toEqual([
      { file: 'src/cli.ts', role: 'production', entry: true },
      { file: 'src/lib.ts', role: 'production' },
    ]);
  });

  it('reports a published package', () => {
    const root = project({
      manifest: { name: 'lib', main: 'src/index.ts' },
      files: { 'src/index.ts': 'export const lib = 1;\n' },
    });

    expect(factsOf(root).packages).toEqual([{ root: '', published: true }]);
  });

  it('reports every package of a workspace', () => {
    const root = project({
      manifest: { name: 'repo', private: true, workspaces: ['packages/*'] },
      files: {
        'packages/a/package.json': { name: 'a', main: 'src/index.ts' },
        'packages/a/src/index.ts': 'export const a = 1;\n',
        'packages/b/package.json': { name: 'b', private: true },
        'packages/b/src/index.ts': 'export const b = 1;\n',
      },
    });

    expect(factsOf(root).packages).toEqual([
      { root: '', published: false },
      { root: 'packages/a', published: true },
      { root: 'packages/b', published: false },
    ]);
  });
});

describe('the language and frameworks of a project', () => {
  it('treats the default export of a framework route as an entry', () => {
    const root = project({
      files: {
        'src/app/page.ts':
          'export default function page(): void {}\nexport function helper(): void {}\n',
      },
    });
    const policy = { frameworks: { defaultExports: ['src/app/**/page.ts'], entryPoints: [] } };

    expect(factsOf(root, policy).callables.map(({ id, entry }) => ({ id, entry }))).toEqual([
      { id: 'src/app/page.ts#page', entry: true },
      { id: 'src/app/page.ts#helper', entry: undefined },
    ]);
  });

  it('produces facts for a JavaScript project that pass the schema', () => {
    const root = project({
      files: {
        'src/index.js':
          '/** @param {string} name */\nexport function greet(name) {\n  return name;\n}\n',
      },
    });
    const facts = factsOf(root, { preset: 'javascript' });

    expect(() => validateFacts(facts)).not.toThrow();
    expect(facts.callables.map(({ id, params }) => ({ id, params }))).toEqual([
      { id: 'src/index.js#greet', params: [{ name: 'name', type: 'string' }] },
    ]);
  });

  it('finds nothing to report in a small well-formed project', () => {
    const root = project({ files: { 'src/index.ts': 'export const answer = 42;\n' } });

    expect(findingsOf(root)).toEqual([]);
  });
});

const SESSION_CONTRACT = {
  protocols: [{ type: 'Session', open: ['open'], close: ['commit', 'rollback'], steps: ['write'] }],
};

function summaryOf(findings) {
  return findings.map(({ rule, classification, path }) => ({ rule, classification, path }));
}

describe('the design rules over the facts of a fixture project', () => {
  it('reports every design signal the project shows', () => {
    const root = project({ fixture: 'signals' });

    expect(summaryOf(findingsOf(root))).toEqual([
      {
        rule: 'foreign-state-decision',
        classification: 'descriptive',
        path: 'src/accounts/audit.ts',
      },
      { rule: 'forwarding-chain', classification: 'descriptive', path: 'src/forward/outer.ts' },
      { rule: 'caller-protocol', classification: 'descriptive', path: 'src/jobs/export-job.ts' },
      { rule: 'disjoint-consumer-groups', classification: 'descriptive', path: 'src/model.ts' },
      { rule: 'data-clump', classification: 'descriptive', path: 'src/net/client.ts' },
      {
        rule: 'repeated-policy-decision',
        classification: 'descriptive',
        path: 'src/policy/cost.ts',
      },
      { rule: 'context-threading', classification: 'descriptive', path: 'src/threading/start.ts' },
    ]);
  });

  it('enforces a protocols contract at the open that is never closed', () => {
    const root = project({ fixture: 'signals' });
    const protocolFindings = findingsOf(root, SESSION_CONTRACT).filter(
      ({ rule }) => rule === 'caller-protocol',
    );

    expect(summaryOf(protocolFindings)).toEqual([
      { rule: 'caller-protocol', classification: 'enforceable', path: 'src/jobs/export-job.ts' },
      { rule: 'caller-protocol', classification: 'descriptive', path: 'src/jobs/export-job.ts' },
    ]);
  });

  it('reports a private field changed through the value a member returns', () => {
    const root = project({ fixture: 'flow' });

    expect(summaryOf(findingsOf(root))).toEqual([
      { rule: 'mutable-state-escape', classification: 'enforceable', path: 'src/mutations.ts' },
      { rule: 'mutable-state-escape', classification: 'enforceable', path: 'src/mutations.ts' },
      { rule: 'mutable-state-escape', classification: 'enforceable', path: 'src/mutations.ts' },
    ]);
  });

  it.each(['types', 'callables', 'decisions'])(
    'reports nothing for the %s fixture, which shows no signal',
    (fixture) => {
      expect(findingsOf(project({ fixture }))).toEqual([]);
    },
  );
});
