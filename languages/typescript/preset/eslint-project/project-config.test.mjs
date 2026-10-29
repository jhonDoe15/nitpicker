import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { conventionStyle } from '../../../../core/conventions/definitions.mjs';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { eslintConfigFiles, eslintProjectFacts } from './project-config.mjs';

const roots = [];

function project(files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-eslint-config-')));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function linked(root, link, target) {
  mkdirSync(path.dirname(path.join(root, link)), { recursive: true });
  symlinkSync(target, path.join(root, link));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const CONFIG = [
  "import js from '@eslint/js';",
  "import { fileURLToPath } from 'node:url';",
  "import rules from './eslint/rules.js';",
  "import { house } from './eslint/plugins';",
  "const ignored = fileURLToPath(new URL('.gitignore', import.meta.url));",
  'export default [js.configs.recommended, { rules }, house, ignored];',
  '',
].join('\n');
const FILES = {
  'eslint.config.mjs': CONFIG,
  '.gitignore': 'dist/\n',
  'eslint/rules.ts': "import names from './names.json';\nexport default names;\n",
  'eslint/names.json': '{ "eqeqeq": "error" }\n',
  'eslint/plugins/index.mjs': 'export const house = {};\n',
  'eslint/unused.mjs': 'export default {};\n',
  'node_modules/@eslint/js/package.json': '{ "name": "@eslint/js", "version": "10.0.1" }\n',
};
const MONOREPO = {
  '.git/HEAD': 'ref: refs/heads/main\n',
  'shared/rules.mjs': "export default { eqeqeq: 'error' };\n",
  'packages/house/package.json': '{ "name": "house", "main": "index.js" }\n',
  'packages/house/index.js': "module.exports = require('./rules.js');\n",
  'packages/house/rules.js': 'module.exports = {};\n',
  'app/eslint.config.mjs':
    "import rules from '../shared/rules.mjs';\nimport house from 'house';\nexport default [{ rules }, house];\n",
};

describe('the ESLint project config files', () => {
  it('follow the config ESLint loads first, every local file it imports and the files it names', () => {
    const root = project({ ...FILES, 'eslint.config.js': 'export default [];\n' });

    expect(eslintConfigFiles(root)).toEqual(['eslint.config.js']);
    expect(eslintConfigFiles(project(FILES))).toEqual([
      'eslint.config.mjs',
      '.gitignore',
      'eslint/names.json',
      'eslint/plugins/index.mjs',
      'eslint/rules.ts',
    ]);
    expect(eslintConfigFiles(project({ 'eslint/rules.ts': '' }))).toEqual([]);
  });

  it('digest the files it reads and the installed package versions, not unrelated files', () => {
    const facts = eslintProjectFacts(project(FILES));
    const digestWith = (changed) => eslintProjectFacts(project({ ...FILES, ...changed }));

    expect(facts.projectConfigFile).toBe('eslint.config.mjs');
    expect(digestWith({ 'eslint/unused.mjs': '1;\n' })).toEqual(facts);
    expect(
      [
        { 'eslint/names.json': '{}\n' },
        { '.gitignore': 'build/\n' },
        { 'node_modules/@eslint/js/package.json': '{ "version": "10.0.2" }\n' },
      ].map((changed) => digestWith(changed).projectConfigDigest === facts.projectConfigDigest),
    ).toEqual([false, false, false]);
    expect(eslintProjectFacts(project({}))).toEqual({ projectConfigMissing: true });
  });

  it('follow imports through the repository, workspace packages included', () => {
    const repository = project(MONOREPO);
    linked(repository, 'app/node_modules/house', path.join(repository, 'packages/house'));
    const root = path.join(repository, 'app');
    const before = eslintProjectFacts(root).projectConfigDigest;
    writeFileSync(path.join(repository, 'packages/house/rules.js'), 'module.exports = { a: 1 };\n');

    expect(eslintConfigFiles(root)).toEqual([
      'eslint.config.mjs',
      '../packages/house/index.js',
      '../packages/house/package.json',
      '../packages/house/rules.js',
      '../shared/rules.mjs',
    ]);
    expect(eslintProjectFacts(root).projectConfigDigest).not.toBe(before);
  });

  it('read a config linked inside the repository and reject one that leaves it', () => {
    const repository = project(MONOREPO);
    const outside = project({ 'eslint.config.mjs': 'export default [];\n' });
    linked(repository, 'linked/eslint.config.mjs', '../app/eslint.config.mjs');
    linked(repository, 'escaped/eslint.config.mjs', path.join(outside, 'eslint.config.mjs'));
    writeFileSync(
      path.join(repository, 'app/imports-out.mjs'),
      "import '../../outside-rules.mjs';\n",
    );

    expect(eslintConfigFiles(path.join(repository, 'linked'))[0]).toBe('eslint.config.mjs');
    expect(() => eslintProjectFacts(path.join(repository, 'escaped'))).toThrow(
      `The ESLint config cannot be layered: eslint.config.mjs resolves to ${path.join(outside, 'eslint.config.mjs')}, outside the repository. Keep the config and the files it imports inside the repository.`,
    );
    writeFileSync(
      path.join(repository, 'app/eslint.config.mjs'),
      "import './imports-out.mjs';\nexport default [];\n",
    );
    expect(() => eslintProjectFacts(path.join(repository, 'app'))).toThrow(
      'imports-out.mjs imports ../../outside-rules.mjs, outside the repository',
    );
  });
});

describe('the head policy for the ESLint project config', () => {
  it.each(['typescript', 'javascript'])(
    'records the %s project config only when the precedence lists the project',
    (preset) => {
      const root = project(FILES);
      const tools = (precedence) => ({ eslint: { engine: 'eslint', precedence } });
      const facts = eslintProjectFacts(root);

      expect(resolveHeadPolicy({ preset, tools: tools(['nitpicker']) }, root).tools).toEqual(
        tools(['nitpicker']),
      );
      expect(
        resolveHeadPolicy({ preset, tools: tools(['nitpicker', 'project']) }, root).tools,
      ).toEqual({ eslint: { ...tools(['nitpicker', 'project']).eslint, ...facts } });
    },
  );

  it('hands the head facts to a base that lists the project, replacing a stale missing flag', () => {
    const root = project(FILES);
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const head = resolveHeadPolicy(optedIn, root);
    const staleBase = resolveHeadPolicy(optedIn, project({}));

    expect(staleBase.tools.eslint.projectConfigMissing).toBe(true);
    expect(withHeadCheckoutFacts(staleBase, head).tools.eslint).toEqual(head.tools.eslint);
    expect(withHeadCheckoutFacts(resolveHeadPolicy(optedIn), head).tools.eslint).toEqual(
      head.tools.eslint,
    );
    expect(withHeadCheckoutFacts(resolveHeadPolicy({ tools: {} }), head).tools).toEqual({});
  });
});

describe('the notice for an ESLint config nitpicker ignores', () => {
  const NOTICE =
    'Ignoring eslint.config.mjs; opt in with "tools": { "eslint": { "precedence": ["project", "nitpicker"] } }';
  const summary = (preset, config, files = FILES) =>
    conventionStyle(preset, { config, projectRoot: project(files) }).summary({});

  it.each([undefined, 'typescript', 'javascript'])('is printed with the %s preset', (preset) => {
    expect(summary(preset, preset === undefined ? {} : { preset })).toEqual([NOTICE]);
  });

  it('keeps the other ESLint settings in the snippet it suggests', () => {
    expect(summary('typescript', { tools: { eslint: { engine: 'eslint' } } })).toEqual([
      'Ignoring eslint.config.mjs; opt in with "tools": { "eslint": { "engine": "eslint", "precedence": ["project", "nitpicker"] } }',
    ]);
  });

  it('is not printed once the project opts in, or without a config', () => {
    const optedIn = { tools: { eslint: { precedence: ['nitpicker', 'project'] } } };

    expect(summary('typescript', optedIn)).toEqual([]);
    expect(summary('typescript', {}, {})).toEqual([]);
    expect(summary('python', {})).not.toContain(NOTICE);
  });
});
