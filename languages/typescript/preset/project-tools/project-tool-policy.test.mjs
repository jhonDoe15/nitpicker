import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { conventionStyle } from '../../../../core/conventions/definitions.mjs';
import { projectToolLayer, withProjectToolConfigs } from './project-tool-policy.mjs';

const roots = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-project-tools-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

const OPTED_IN = { knip: { precedence: ['project', 'nitpicker'] } };
const ONLY_DATA = 'only JSON values and regular expressions can be used';

function unread(file, reason) {
  return `Could not read the project's knip config (${file}): ${reason}`;
}

function failure(root, options) {
  const settings = withProjectToolConfigs(OPTED_IN, root, options).knip;
  expect(settings).toEqual({
    precedence: ['project', 'nitpicker'],
    projectConfigError: settings.projectConfigError,
    projectConfigDigest: expect.any(String),
  });
  expect(() => projectToolLayer('knip', settings)).toThrow(settings.projectConfigError);
  return settings.projectConfigError;
}

describe('project tool configs in the head policy', () => {
  it('leaves the project config unread without the opt-in or when dead-code is disabled', () => {
    const root = project({ 'knip.json': '{ broken' });
    const tools = { knip: { precedence: ['nitpicker'] }, prettier: { precedence: ['project'] } };
    expect(withProjectToolConfigs(tools, root)).toEqual(tools);
    expect(withProjectToolConfigs(undefined, root)).toBeUndefined();
    expect(projectToolLayer('knip', tools.knip)).toBeUndefined();
    expect(withProjectToolConfigs(OPTED_IN, root, { disabled: ['dead-code'] })).toEqual(OPTED_IN);
  });

  it('captures the head config with a digest that follows its edits', () => {
    const root = project({
      'knip.jsonc': '// house rules\n{ "ignore": ["a/**"], "compilers": { "css": true }, }',
      'package.json': '{ "knip": { "ignore": ["b/**"], "entry": ["x.ts"] }, }',
    });
    const first = withProjectToolConfigs(OPTED_IN, root).knip;
    expect(first).toEqual({
      precedence: ['project', 'nitpicker'],
      projectConfig: { ignore: ['a/**'], entry: ['x.ts'] },
      projectConfigDigest: expect.any(String),
    });
    writeFileSync(path.join(root, 'knip.jsonc'), '{ "ignore": ["c/**"] }');
    const second = withProjectToolConfigs(OPTED_IN, root).knip;
    expect(second.projectConfigDigest).not.toBe(first.projectConfigDigest);
    expect(projectToolLayer('knip', second)).toEqual({
      precedence: ['project', 'nitpicker'],
      config: { ignore: ['c/**'], entry: ['x.ts'] },
    });
  });

  it('runs a script config with a filtered environment and ignores what it prints', () => {
    vi.stubEnv('GITHUB_OUTPUT', 'out');
    vi.stubEnv('NITPICKER_PROBE', 'kept');
    const root = project({
      'knip.ts': [
        'console.log("loading");',
        "const ignore = [process.env.GITHUB_OUTPUT ?? 'unset', process.env.NITPICKER_PROBE];",
        'export default { ignore, workspaces: { app: { compilers: { css: () => "" } } } };',
      ].join('\n'),
    });
    expect(withProjectToolConfigs(OPTED_IN, root).knip.projectConfig).toEqual({
      ignore: ['unset', 'kept'],
      workspaces: { app: {} },
    });
  });

  it('records why a named config cannot be used and fails when the tool runs', () => {
    expect(failure(project({}))).toBe(
      '"tools.knip.precedence" lists "project" but a knip config (knip.json, knip.jsonc, .knip.json, ' +
        '.knip.jsonc, knip.ts, knip.js, knip.config.ts, knip.config.js, or the "knip" key in ' +
        'package.json) is missing: create it, or remove "project" from tools.knip.precedence',
    );
    expect(failure(project({ 'knip.json': '[1]' }))).toBe(
      unread('knip.json', 'knip.json must hold an object'),
    );
    expect(failure(project({ 'knip.json': '{ "entry": [' }))).toMatch(
      /^Could not read the project's knip config \(knip\.json\): knip\.json is not valid JSON: .+$/u,
    );
    const nested = 'export default { ignoreDependencies: [() => 1], paths: { a: new Set() } };';
    expect(failure(project({ 'knip.js': nested }))).toBe(
      unread('knip.js', `knip.js: ignoreDependencies[0] is a function; ${ONLY_DATA}`),
    );
    expect(failure(project({ 'knip.js': 'export default { tags: new Date(0) };' }))).toBe(
      unread('knip.js', `knip.js: tags is a Date; ${ONLY_DATA}`),
    );
    const thrown = project({ 'knip.js': 'throw new Error("boom");' });
    expect(failure(thrown)).toBe(
      unread('knip.js', `Error loading ${path.join(thrown, 'knip.js')}: boom`),
    );
    expect(failure(project({ 'knip.js': 'process.exit(0);' }))).toBe(
      unread('knip.js', 'the config exited (code 0) before it finished loading'),
    );
    expect(() => projectToolLayer('knip', { precedence: ['project'] })).toThrow(
      'The head policy holds no project knip config',
    );
  });

  it('stops a config that never finishes loading', () => {
    const root = project({
      'knip.ts': 'export default new Promise(() => setInterval(() => undefined, 1000));',
    });
    expect(failure(root, { timeout: 3000 })).toBe(
      unread('knip.ts', 'the config did not finish loading within 3 seconds'),
    );
  });

  it('rejects a config file that resolves outside the project', () => {
    const outside = project({ 'knip.json': '{ "ignore": ["leaked/**"] }' });
    const root = project({});
    symlinkSync(path.join(outside, 'knip.json'), path.join(root, 'knip.json'));
    expect(failure(root)).toBe(unread('knip.json', 'knip.json must be a file inside the project'));
  });

  it('keeps the base precedence and takes only the captured head facts', () => {
    const root = project({ 'knip.json': '{ "ignore": ["a/**"] }' });
    const head = resolveHeadPolicy({ tools: OPTED_IN }, root);
    const firstOnly = { knip: { precedence: ['nitpicker', 'project'] } };
    expect(withHeadCheckoutFacts(resolveHeadPolicy({ tools: firstOnly }), head).tools.knip).toEqual(
      { ...head.tools.knip, precedence: ['nitpicker', 'project'] },
    );
    const plain = { knip: { precedence: ['nitpicker'] } };
    expect(withHeadCheckoutFacts(resolveHeadPolicy({ tools: plain }), head).tools).toEqual(plain);
    expect(withHeadCheckoutFacts(resolveHeadPolicy({}), head).tools).toBeUndefined();
    const dropped = resolveHeadPolicy({}, root);
    expect(withHeadCheckoutFacts(resolveHeadPolicy({ tools: OPTED_IN }), dropped).tools).toEqual({
      knip: { precedence: ['nitpicker'] },
    });
    expect(existsSync(path.join(root, 'knip.json'))).toBe(true);
  });

  it('prints one notice per project config it ignores', () => {
    const root = project({
      'knip.jsonc': '{}',
      'package.json': '{ "knip": {} }',
    });
    const summary = (config, preset) =>
      conventionStyle(preset, { config, projectRoot: root }).summary();
    const notice =
      'Ignoring knip.jsonc and the "knip" key in package.json; ' +
      'opt in with "tools": { "knip": { "precedence": ["project", "nitpicker"] } }';
    expect(summary({})).toEqual([notice]);
    writeFileSync(path.join(root, '.dependency-cruiser.cjs'), 'module.exports = {};');
    const cruiserNotice =
      'Ignoring .dependency-cruiser.cjs; ' +
      'opt in with "tools": { "dependency-cruiser": { "precedence": ["project", "nitpicker"] } }';
    expect(summary({})).toEqual([notice, cruiserNotice]);
    rmSync(path.join(root, '.dependency-cruiser.cjs'));
    expect(summary({ preset: 'javascript' }, 'javascript')).toEqual([notice]);
    expect(summary({ tools: OPTED_IN })).toEqual([]);
    expect(conventionStyle(undefined, { config: {}, projectRoot: project({}) }).summary()).toEqual(
      [],
    );
  });
});

describe('dependency-cruiser configs in the head policy', () => {
  const tools = { 'dependency-cruiser': { precedence: ['project', 'nitpicker'] } };
  const settingsOf = (root) => withProjectToolConfigs(tools, root)['dependency-cruiser'];
  const unreadCruiser = (file, reason) =>
    `Could not read the project's dependency-cruiser config (${file}): ${reason}`;

  it('reads JSON in process, hands JSON5 and extends to dependency-cruiser, and keeps patterns', () => {
    const root = project({
      '.dependency-cruiser.json': '{ forbidden: [{ name: "x", from: {}, to: {} }], // json5\n}',
    });
    expect(settingsOf(root).projectConfig).toEqual({
      forbidden: [{ name: 'x', from: {}, to: {} }],
    });
    const extending = project({
      'base.json': '{ "options": { "exclude": "^gen" } }',
      '.dependency-cruiser.json':
        '{ "extends": "./base.json", "forbidden": [{ "name": "y", "from": {}, "to": {} }] }',
    });
    expect(settingsOf(extending).projectConfig).toEqual({
      forbidden: [{ name: 'y', from: {}, to: {} }],
      options: { exclude: '^gen' },
    });
    const script = project({
      '.dependency-cruiser.cjs': 'module.exports = { options: { exclude: { path: /^gen/u } } };',
    });
    expect(settingsOf(script).projectConfig).toEqual({
      options: { exclude: { path: { $nitpickerRegExp: ['^gen', 'u'] } } },
    });
  });

  it('resolves the webpack and babel config files against the head checkout', () => {
    const options = {
      webpackConfig: { fileName: 'webpack.config.js', env: 'production' },
      babelConfig: { fileName: 'config/babel.json' },
    };
    const json = project({ '.dependency-cruiser.json': JSON.stringify({ options }) });
    const script = project({
      '.dependency-cruiser.cjs': `module.exports = ${JSON.stringify({ options })};`,
    });
    for (const root of [json, script]) {
      expect(settingsOf(root).projectConfig.options).toEqual({
        webpackConfig: { fileName: path.join(root, 'webpack.config.js'), env: 'production' },
        babelConfig: { fileName: path.join(root, 'config/babel.json') },
      });
    }
  });

  it('rejects extends and local requires that resolve outside the project', () => {
    const outside = project({ 'shared.cjs': 'module.exports = { forbidden: [] };' });
    const shared = path.join(outside, 'shared.cjs');
    const viaExtends = project({
      '.dependency-cruiser.json': JSON.stringify({ extends: shared }),
    });
    expect(settingsOf(viaExtends).projectConfigError).toBe(
      unreadCruiser(
        '.dependency-cruiser.json',
        `"extends": "${shared}" in .dependency-cruiser.json is outside the project`,
      ),
    );
    const viaRequire = project({
      '.dependency-cruiser.cjs': `module.exports = require(${JSON.stringify(shared)});`,
    });
    expect(settingsOf(viaRequire).projectConfigError).toBe(
      unreadCruiser(
        '.dependency-cruiser.cjs',
        `${shared} in .dependency-cruiser.cjs is outside the project`,
      ),
    );
  });
});
