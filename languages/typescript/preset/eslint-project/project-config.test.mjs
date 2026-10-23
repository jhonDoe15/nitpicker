import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { conventionStyle } from '../../../../core/conventions/definitions.mjs';
import { resolveHeadPolicy, withHeadCheckoutFacts } from '../head-policy.mjs';
import { ignoredEslintConfigNotices } from './eslint-style.mjs';
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

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const CONFIG = [
  "import js from '@eslint/js';",
  "import rules from './eslint/rules.js';",
  "import { house } from './eslint/plugins';",
  "const shared = await import('../outside.mjs');",
  'export default [js.configs.recommended, { rules }, house, shared];',
  '',
].join('\n');
const FILES = {
  'eslint.config.mjs': CONFIG,
  'eslint/rules.ts': "import names from './names.json';\nexport default names;\n",
  'eslint/names.json': '{ "eqeqeq": "error" }\n',
  'eslint/plugins/index.mjs': 'export const house = {};\n',
  'eslint/unused.mjs': 'export default {};\n',
};

describe('the ESLint project config files', () => {
  it('follow the config ESLint loads first and every local file it imports', () => {
    const root = project({ ...FILES, 'eslint.config.js': 'export default [];\n' });

    expect(eslintConfigFiles(root)).toEqual(['eslint.config.js']);
    expect(eslintConfigFiles(project(FILES))).toEqual([
      'eslint.config.mjs',
      'eslint/names.json',
      'eslint/plugins/index.mjs',
      'eslint/rules.ts',
    ]);
    expect(eslintConfigFiles(project({ 'eslint/rules.ts': '' }))).toEqual([]);
  });

  it('digest the imported files, not the unrelated ones', () => {
    const facts = eslintProjectFacts(project(FILES));

    expect(facts.projectConfigFile).toBe('eslint.config.mjs');
    expect(eslintProjectFacts(project({ ...FILES, 'eslint/unused.mjs': '1;\n' }))).toEqual(facts);
    expect(
      eslintProjectFacts(project({ ...FILES, 'eslint/names.json': '{}\n' })).projectConfigDigest,
    ).not.toBe(facts.projectConfigDigest);
    expect(eslintProjectFacts(project({}))).toEqual({ projectConfigMissing: true });
  });

  it('do not follow a config that links outside the project', () => {
    const outside = project({ 'eslint.config.mjs': 'export default [];\n' });
    const root = project({});
    symlinkSync(path.join(outside, 'eslint.config.mjs'), path.join(root, 'eslint.config.mjs'));

    expect(eslintConfigFiles(root)).toEqual([]);
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

  it('hands the head facts to a base that lists the project, and to no other base', () => {
    const root = project(FILES);
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const head = resolveHeadPolicy(optedIn, root);

    expect(withHeadCheckoutFacts(resolveHeadPolicy(optedIn), head).tools.eslint).toEqual(
      head.tools.eslint,
    );
    expect(withHeadCheckoutFacts(resolveHeadPolicy({ tools: {} }), head).tools).toEqual({});
  });
});

describe('the notice for an ESLint config nitpicker ignores', () => {
  const NOTICE =
    'Ignoring eslint.config.mjs; opt in with "tools": { "eslint": { "precedence": ["project", "nitpicker"] } }';

  it.each([undefined, 'typescript', 'javascript'])('is printed with the %s preset', (preset) => {
    const projectRoot = project(FILES);
    const config = preset === undefined ? {} : { preset };

    expect(conventionStyle(preset, { config, projectRoot }).summary({})).toEqual([NOTICE]);
  });

  it('is not printed once the project opts in, or without a config', () => {
    const optedIn = { tools: { eslint: { precedence: ['nitpicker', 'project'] } } };

    expect(ignoredEslintConfigNotices({ config: optedIn, projectRoot: project(FILES) })).toEqual(
      [],
    );
    expect(ignoredEslintConfigNotices({ config: {}, projectRoot: project({}) })).toEqual([]);
    expect(
      conventionStyle('python', { config: {}, projectRoot: project(FILES) }).summary({}),
    ).not.toContain(NOTICE);
  });
});
