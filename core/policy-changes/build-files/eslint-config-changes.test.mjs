import { describe, expect, it } from 'vitest';
import { between, changesOf, without } from './test-support/policy-fixtures.mjs';

describe('the ESLint flat config the project opted into', () => {
  const at = (config, rules = "export default { 'no-console': 'error' };\n") => ({
    'eslint.config.mjs': config,
    'eslint/rules.mjs': rules,
    'eslint/unused.mjs': 'export default {};\n',
    'src/a.ts': 'export const a = 1;\n',
  });
  const CONFIG = "import rules from './eslint/rules.mjs';\nexport default [{ rules }];\n";

  it.each([
    ['typescript', ['project', 'nitpicker']],
    ['javascript', ['project']],
    ['typescript', ['nitpicker', 'project']],
  ])(
    'counts an edit of the %s config or a local file it imports, listing %j',
    (preset, precedence) => {
      const config = { preset, tools: { eslint: { precedence } } };
      const base = at(CONFIG);

      expect(
        between({ base, head: at(`// house rules\n${CONFIG}`), config }).policyLoosenings,
      ).toEqual([]);
      expect(
        between({ base, head: at(CONFIG.replace('[{', '[{ ignores: ["src/**"] }, {')), config })
          .policyLoosenings,
      ).toEqual(['eslint project config changed: eslint.config.mjs']);
      expect(
        between({ base, head: at(CONFIG, "export default { 'no-console': 'off' };\n"), config })
          .policyLoosenings,
      ).toEqual(['eslint project config changed: eslint/rules.mjs']);
      expect(
        between({ base, head: { ...base, 'eslint/unused.mjs': 'export default 1;\n' }, config })
          .policyLoosenings,
      ).toEqual([]);
    },
  );

  it('stays quiet while the project has not opted in, and lists a removed config', () => {
    const optedIn = { tools: { eslint: { precedence: ['project', 'nitpicker'] } } };
    const base = at(CONFIG);
    const edited = at(CONFIG, "export default { 'no-console': 'off' };\n");

    expect(between({ base, head: edited, config: { tools: {} } }).policyLoosenings).toEqual([]);
    expect(
      changesOf(between({ base, head: without(base, 'eslint.config.mjs'), config: optedIn })),
    ).toEqual({
      policyLoosenings: [],
      policyChanges: [
        'eslint project config removed: eslint.config.mjs',
        'eslint project config removed: eslint/rules.mjs',
      ],
    });
  });

  it('lists every file an opt-in starts reading, the opt-in itself included', () => {
    const files = { ...at(CONFIG), '.gitignore': 'dist/\n' };
    const config = (precedence) => ({ tools: { eslint: { precedence } } });

    expect(
      between({
        base: files,
        head: files,
        baseConfig: config(['nitpicker']),
        config: config(['nitpicker', 'project']),
      }).policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint.config.mjs',
      'eslint project config changed: eslint/rules.mjs',
      'tools.eslint.precedence: ["nitpicker"] -> ["nitpicker","project"]',
    ]);
  });

  it('counts the ignore file the config reads, but not a comment after code', () => {
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const ignoring = (gitignore, config = 'export default [ignored];\n') => ({
      ...at(
        `import { includeIgnoreFile } from '@eslint/compat';\nconst ignored = includeIgnoreFile(new URL('.gitignore', import.meta.url).pathname);\n${config}`,
      ),
      '.gitignore': gitignore,
    });
    const base = ignoring('dist/\n');

    expect(
      between({
        base,
        head: ignoring('# build\ndist/\n', 'export default [ignored]; // house\n'),
        config: optedIn,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base, head: ignoring('dist/\nsrc/\n'), config: optedIn }).policyLoosenings,
    ).toEqual(['eslint project config changed: .gitignore']);
  });

  it('lists the nitpicker rules whose options the project replaces once a reviewed file changes', () => {
    const config = (precedence) => ({ tools: { eslint: { precedence } } });
    const base = at(CONFIG);
    const head = at(
      CONFIG,
      "export default { 'no-empty': ['error', { allowEmptyCatch: true }] };\n",
    );
    const replacedOptions = () => ({ rules: ['no-empty'] });
    const unloadable = () => ({
      error: 'ESLint config eslint.config.mjs could not be loaded: boom',
    });

    expect(
      between({ base, head, config: config(['project']), replacedOptions }).policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint/rules.mjs',
      'eslint project config replaces the options of nitpicker rule no-empty',
    ]);
    expect(
      between({ base, head, config: config(['project']), replacedOptions: unloadable })
        .policyLoosenings,
    ).toEqual([
      'eslint project config changed: eslint/rules.mjs',
      'eslint project config could not be loaded to list the nitpicker rules whose options it replaces: ESLint config eslint.config.mjs could not be loaded: boom',
    ]);
    expect(
      between({ base, head: base, config: config(['project']), replacedOptions }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({ base, head, config: config(['nitpicker', 'project']), replacedOptions })
        .policyLoosenings,
    ).toEqual(['eslint project config changed: eslint/rules.mjs']);
  });

  it('follows the config file ESLint itself loads first', () => {
    const optedIn = { tools: { eslint: { precedence: ['project'] } } };
    const both = (javascript) => ({ ...at(CONFIG), 'eslint.config.js': javascript });

    expect(
      between({
        base: both('export default [];\n'),
        head: both('export default [{}];\n'),
        config: optedIn,
      }).policyLoosenings,
    ).toEqual(['eslint project config changed: eslint.config.js']);
  });
});
