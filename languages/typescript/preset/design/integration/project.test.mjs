import { afterEach, describe, expect, it } from 'vitest';
import { validateFacts } from '../../../../../shared/rules/facts/schema.mjs';
import { createProject, factsOf, findingsOf, removeProject } from '../test-support/project.mjs';

const roots = [];

function publicationOf({ types, callables }) {
  return [...types, ...callables].map(({ id, published }) => ({ id, published }));
}

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

describe('the modules and public surface of a project', () => {
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

  it('publishes what the entry of a published package exports, through its re-exports', () => {
    const root = project({
      manifest: { name: 'lib', main: 'src/index.ts' },
      files: {
        'src/index.ts':
          "export { open } from './api';\nexport * from './shapes';\nexport { Widget as Gadget } from './widget';\n",
        'src/api.ts':
          'export function open(name: string): string {\n  return name;\n}\nexport function internal(name: string): string {\n  return name;\n}\n',
        'src/shapes.ts':
          'export interface Shape {\n  size: number;\n}\nexport function area(shape: Shape): number {\n  return shape.size;\n}\n',
        'src/widget.ts':
          'export class Widget {\n  run(): void {}\n}\nexport class Hidden {\n  run(): void {}\n}\n',
      },
    });
    const facts = factsOf(root);

    expect(publicationOf(facts)).toEqual([
      { id: 'src/api.ts', published: undefined },
      { id: 'src/index.ts', published: true },
      { id: 'src/shapes.ts', published: true },
      { id: 'src/shapes.ts#Shape', published: true },
      { id: 'src/widget.ts', published: undefined },
      { id: 'src/widget.ts#Widget', published: true },
      { id: 'src/widget.ts#Hidden', published: undefined },
      { id: 'src/api.ts#open', published: true },
      { id: 'src/api.ts#internal', published: undefined },
      { id: 'src/shapes.ts#area', published: true },
      { id: 'src/widget.ts#Widget.run', published: undefined },
      { id: 'src/widget.ts#Hidden.run', published: undefined },
    ]);
  });

  it('publishes nothing that a private package exports, even from a layout entry point', () => {
    const root = project({
      files: { 'src/cli.ts': 'export function run(): void {}\n' },
    });

    expect(publicationOf(factsOf(root, { layout: { entryPoints: ['src/cli.ts'] } }))).toEqual([
      { id: 'src/cli.ts', published: undefined },
      { id: 'src/cli.ts#run', published: undefined },
    ]);
  });

  it('publishes a layout entry point of a published package, and not its bin', () => {
    const root = project({
      manifest: { name: 'tool', bin: 'src/cli.ts' },
      files: {
        'src/cli.ts': 'export function run(): void {}\n',
        'src/plugin.ts': 'export function load(): void {}\n',
        'src/helper.ts': 'export function help(): void {}\n',
      },
    });

    const policy = { layout: { entryPoints: ['src/plugin.ts'] } };

    expect(publicationOf(factsOf(root, policy))).toEqual([
      { id: 'src/cli.ts', published: undefined },
      { id: 'src/helper.ts', published: undefined },
      { id: 'src/plugin.ts', published: true },
      { id: 'src/cli.ts#run', published: undefined },
      { id: 'src/helper.ts#help', published: undefined },
      { id: 'src/plugin.ts#load', published: true },
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

  it('skips only the API-shape rules for the types a published package exports', () => {
    const root = project({ fixture: 'signals', manifest: { name: 'lib', main: 'src/model.ts' } });

    expect(summaryOf(findingsOf(root))).toEqual([
      {
        rule: 'foreign-state-decision',
        classification: 'descriptive',
        path: 'src/accounts/audit.ts',
      },
      { rule: 'forwarding-chain', classification: 'descriptive', path: 'src/forward/outer.ts' },
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
      ({ rule }) => rule === 'caller-protocol' || rule === 'protocol-contract',
    );

    expect(summaryOf(protocolFindings)).toEqual([
      { rule: 'caller-protocol', classification: 'descriptive', path: 'src/jobs/export-job.ts' },
      { rule: 'protocol-contract', classification: 'enforceable', path: 'src/jobs/export-job.ts' },
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
