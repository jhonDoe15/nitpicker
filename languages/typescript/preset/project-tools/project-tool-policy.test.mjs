import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { conventionStyle } from '../../../../core/conventions/definitions.mjs';
import { projectToolLayer, withProjectToolConfigs } from './project-tool-policy.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-tools-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
  return root;
}

const OPTED_IN = { knip: { precedence: ['project', 'nitpicker'] } };

describe('project tool configs in the head policy', () => {
  it('leaves the project config unread without the opt-in', () => {
    const root = project({ 'knip.json': '{ broken' });
    const tools = { knip: { precedence: ['nitpicker'] }, prettier: { precedence: ['project'] } };
    expect(withProjectToolConfigs(tools, root)).toEqual(tools);
    expect(withProjectToolConfigs(undefined, root)).toBeUndefined();
    expect(projectToolLayer('knip', tools.knip)).toBeUndefined();
  });

  it('captures the head config with a digest that follows its edits', () => {
    const root = project({
      'knip.json': '{ "ignore": ["a/**"] }',
      'package.json': '{ "knip": { "ignore": ["b/**"], "entry": ["x.ts"] } }',
    });
    const first = withProjectToolConfigs(OPTED_IN, root).knip;
    expect(first).toMatchObject({
      projectConfigFile: 'knip.json and the "knip" key in package.json',
      projectConfig: { ignore: ['a/**'], entry: ['x.ts'] },
    });
    writeFileSync(path.join(root, 'knip.json'), '{ "ignore": ["c/**"] }');
    const second = withProjectToolConfigs(OPTED_IN, root).knip;
    expect(second.projectConfigDigest).not.toBe(first.projectConfigDigest);
    expect(projectToolLayer('knip', second)).toEqual({
      precedence: ['project', 'nitpicker'],
      config: { ignore: ['c/**'], entry: ['x.ts'] },
    });
  });

  it('records why a named config cannot be used and fails when the tool runs', () => {
    const cases = [
      [{}, '"tools.knip.precedence" lists "project" but a knip config'],
      [{ 'knip.json': '[1]' }, 'knip.json must hold an object'],
      [{ 'knip.js': 'export default { ignore: () => 1 };' }, 'knip.js.ignore is a function'],
      [{ 'knip.js': 'throw new Error("boom");' }, 'boom'],
    ];
    for (const [files, message] of cases) {
      const settings = withProjectToolConfigs(OPTED_IN, project(files)).knip;
      expect(settings.projectConfigError).toContain(message);
      expect(() => projectToolLayer('knip', settings)).toThrow(message);
    }
    expect(() => projectToolLayer('knip', { precedence: ['project'] })).toThrow(
      'The head policy holds no project knip config',
    );
  });

  it('gives the base snapshot the head settings and captured config', () => {
    const root = project({ 'knip.json': '{ "ignore": ["a/**"] }' });
    const head = resolveHeadPolicy({ tools: OPTED_IN }, root);
    const base = resolveHeadPolicy({ tools: { knip: { precedence: ['nitpicker'] } } });
    expect(withHeadCheckoutFacts(base, head).tools.knip).toEqual(head.tools.knip);
    expect(withHeadCheckoutFacts(resolveHeadPolicy({}), head).tools.knip).toEqual(head.tools.knip);
    const plain = resolveHeadPolicy({}, root);
    expect(withHeadCheckoutFacts(base, plain).tools).toEqual({});
    expect(withHeadCheckoutFacts(resolveHeadPolicy({}), plain).tools).toBeUndefined();
  });

  it('prints one notice per project config it ignores', () => {
    const root = project({
      'knip.jsonc': '{}',
      'package.json': '{ "knip": {} }',
    });
    const summary = (config, preset) =>
      conventionStyle(preset, { config, projectRoot: root }).summary();
    const notice =
      'Ignoring knip.jsonc and the "knip" key in package.json; opt in with "tools": { "knip": { "precedence": ["project", "nitpicker"] } }';
    expect(summary({})).toEqual([notice]);
    expect(summary({ preset: 'javascript' }, 'javascript')).toEqual([notice]);
    expect(summary({ tools: OPTED_IN })).toEqual([]);
    expect(conventionStyle(undefined, { config: {}, projectRoot: project({}) }).summary()).toEqual(
      [],
    );
  });
});
