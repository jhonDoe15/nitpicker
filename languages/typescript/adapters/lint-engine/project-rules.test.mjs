import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { applyRuleExceptions } from '../../preset/eslint-config/exceptions.mjs';
import {
  layeredPolicy,
  layerEntries,
  PROJECT_LAYER_VARIABLE,
  projectLayerValue,
} from './project-layer.mjs';
import { replacedOptionRules } from './project-rules.mjs';
import { temporaryProjects } from './test-support/layered-project.mjs';

const projects = temporaryProjects();
const PROJECT_FIRST = ['project', 'nitpicker'];
const RULE = { meta: { schema: false }, create: () => ({}) };
const NITPICKER = { rules: { 'no-baz': RULE, 'no-foo': RULE } };
const HOUSE = { rules: { extra: RULE } };
const NO_UNDEF = { typeof: false };

afterAll(() => {
  projects.remove();
});

async function layered(policy, projectText, { precedence = PROJECT_FIRST, addsRules = true } = {}) {
  const root = projects.create({ 'eslint.config.mjs': projectText });
  const environment = {
    [PROJECT_LAYER_VARIABLE]: projectLayerValue(
      { precedence, projectConfigFile: 'eslint.config.mjs' },
      { liveProjectRoot: root, addsRules },
    ),
  };
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: await layeredPolicy(policy, environment),
  });
  return {
    root,
    eslint,
    async rules(file, ruleIds) {
      const config = await eslint.calculateConfigForFile(file);
      return Object.fromEntries(ruleIds.map((ruleId) => [ruleId, config?.rules?.[ruleId]]));
    },
  };
}

describe('the project settings for a rule nitpicker turns on', () => {
  const policy = [
    {
      files: ['src/**/*.ts'],
      ignores: ['src/adapters/**'],
      plugins: { nitpicker: NITPICKER },
      rules: { 'nitpicker/no-baz': 'error' },
    },
    { files: ['src/**/*.ts'], rules: { 'no-console': 'error', 'no-undef': 'off' } },
    { files: ['src/tests/**'], rules: { 'no-console': 'off' } },
  ];
  const project = `export default [
  { rules: { 'nitpicker/no-baz': 'warn', 'no-console': 'warn', 'no-undef': 'error' } },
  { files: ['**/*.ts'], rules: { 'no-console': 'off', 'no-undef': 'off' } },
  { files: ['src/typed/**'], rules: { 'no-undef': 'error' } },
];
`;

  it('apply only on the files nitpicker runs the rule on, and never switch it off', async () => {
    const { rules } = await layered(policy, project);
    const ruleIds = ['nitpicker/no-baz', 'no-console'];

    expect(await rules('src/a.ts', ruleIds)).toEqual({
      'nitpicker/no-baz': [1],
      'no-console': [1, {}],
    });
    expect(await rules('src/adapters/a.ts', ruleIds)).toEqual({
      'nitpicker/no-baz': undefined,
      'no-console': [1, {}],
    });
    expect(await rules('src/tests/a.ts', ruleIds)).toEqual({
      'nitpicker/no-baz': [1],
      'no-console': [0, {}],
    });
  });

  it('keep the project off for a rule nitpicker only turns off', async () => {
    const lint = await layered(policy, project);
    const production = await layered(policy, project, { addsRules: false });

    expect(await lint.rules('src/a.ts', ['no-undef'])).toEqual({ 'no-undef': [0, NO_UNDEF] });
    expect(await lint.rules('src/typed/a.ts', ['no-undef'])).toEqual({
      'no-undef': [2, NO_UNDEF],
    });
    expect(await production.rules('src/typed/a.ts', ['no-undef'])).toEqual({
      'no-undef': [0, NO_UNDEF],
    });
  });

  it('are not used with nitpicker first', async () => {
    const { rules } = await layered(policy, project, { precedence: ['nitpicker', 'project'] });

    expect(await rules('src/a.ts', ['nitpicker/no-baz', 'no-console'])).toEqual({
      'nitpicker/no-baz': [2],
      'no-console': [2, {}],
    });
  });
});

describe('the options a project sets for a nitpicker rule', () => {
  const policy = [
    {
      files: ['**/*.ts'],
      rules: {
        'no-restricted-syntax': ['error', { selector: 'WithStatement', message: 'No with.' }],
        'max-params': ['error', { max: 2 }],
        complexity: ['error', 5],
        'no-empty': 'error',
        curly: ['error', 'multi-line'],
      },
    },
  ];
  const project = `export default [{
  rules: {
    'no-restricted-syntax': ['warn', 'DebuggerStatement'],
    'max-params': ['error', { max: 4 }],
    complexity: ['error', 3],
    'no-empty': ['error', { allowEmptyCatch: true }],
    curly: 'warn',
  },
}];
`;

  it('add to list rules, take the lower limit, and otherwise replace nitpicker options', async () => {
    const { root, rules } = await layered(policy, project);

    expect(await rules('src/a.ts', Object.keys(policy[0].rules))).toEqual({
      'no-restricted-syntax': [
        1,
        { selector: 'WithStatement', message: 'No with.' },
        'DebuggerStatement',
      ],
      'max-params': [2, { max: 2 }],
      complexity: [2, 3],
      'no-empty': [2, { allowEmptyCatch: true }],
      curly: [1, 'multi-line'],
    });
    expect(replacedOptionRules(policy, await layerEntries(`${root}/eslint.config.mjs`))).toEqual([
      'no-empty',
    ]);
  });
});

describe('the rest of a project entry', () => {
  const policy = [
    {
      files: ['**/*.ts'],
      plugins: { nitpicker: NITPICKER, react: HOUSE },
      settings: { nitpickerTestTimeoutPolicy: { limit: 5 }, react: { version: '18' } },
      rules: { 'nitpicker/no-foo': 'error' },
    },
  ];

  it('merges only the settings outside the namespaces nitpicker owns', async () => {
    const { eslint } = await layered(
      policy,
      `export default [{
  settings: {
    nitpickerTestTimeoutPolicy: { limit: 0 },
    nitpickerExtra: true,
    react: { version: '17' },
    'react/pragma': 'h',
    'import/resolver': { node: true },
    house: 1,
  },
}];
`,
    );

    expect((await eslint.calculateConfigForFile('src/a.ts')).settings).toEqual({
      nitpickerTestTimeoutPolicy: { limit: 5 },
      react: { version: '18' },
      'import/resolver': { node: true },
      house: 1,
    });
  });

  it('folds basePath into the patterns of its scope and its ignores', async () => {
    const { eslint, rules } = await layered(
      policy,
      `export default [
  { basePath: 'src/sub', rules: { eqeqeq: 'error' } },
  { basePath: 'src/sub', ignores: ['gen/**'] },
];
`,
    );

    expect(await rules('src/sub/a.ts', ['eqeqeq'])).toEqual({ eqeqeq: [2, 'always'] });
    expect(await rules('src/a.ts', ['eqeqeq'])).toEqual({ eqeqeq: undefined });
    expect(await eslint.isPathIgnored('src/sub/gen/a.ts')).toBe(true);
  });
});

describe('an exception for a rule only the project adds', () => {
  const exceptions = [{ rule: 'no-alert', paths: ['src/legacy/**'], reason: 'Legacy' }];
  const policy = applyRuleExceptions(
    [{ files: ['**/*.ts'], rules: { 'no-console': 'error' } }],
    exceptions,
    { projectRules: true },
  );

  it('lifts the rule once the project config adds it', async () => {
    const { rules } = await layered(
      policy,
      "export default [{ rules: { 'no-alert': 'error' } }];\n",
    );

    expect(await rules('src/legacy/a.ts', ['no-alert'])).toEqual({ 'no-alert': [0] });
    expect(await rules('src/a.ts', ['no-alert'])).toEqual({ 'no-alert': [2] });
  });

  it('is an unknown rule when the project config does not add it', async () => {
    await expect(layered(policy, 'export default [];\n')).rejects.toThrow(
      'nitpicker.config.json "exceptions" name unknown rules: no-alert.',
    );
  });
});
