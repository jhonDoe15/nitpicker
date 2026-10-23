import { afterAll, describe, expect, it } from 'vitest';
import { withHeadCheckoutFacts, resolveHeadPolicy } from '../../preset/head-policy.mjs';
import {
  headPolicyFor,
  lintLayered,
  PROJECT_FILES,
  SOURCES,
  temporaryProjects,
} from './test-support/layered-project.mjs';

const projects = temporaryProjects();
const PROJECT = ['project', 'nitpicker'];
const JITI_STUB = `const { readFileSync } = require('node:fs');
const { fileURLToPath } = require('node:url');

exports.createJiti = () => ({
  import: (url) =>
    import(\`data:text/javascript;charset=utf-8,\${encodeURIComponent(readFileSync(fileURLToPath(url), 'utf8'))}\`),
});
`;

const NITPICKER_RULES = [
  'src/console.ts nitpicker/no-foo',
  'src/console.ts no-console',
  'src/loose.ts directive',
  'src/strict/locked.ts directive',
  'src/strict/locked.ts no-console',
];

function rulesOf(findings) {
  return [...new Set(findings.map(({ file, ruleId }) => `${file} ${String(ruleId)}`))].toSorted();
}

afterAll(() => {
  projects.remove();
});

describe.each(['eslint', 'oxlint'])('the ESLint project config on %s', (engine) => {
  it('applies only its settings for nitpicker rules to the policy checks besides eslint-lint', () => {
    const root = projects.create({ ...SOURCES, ...PROJECT_FILES });
    const findings = lintLayered({
      projectRoot: root,
      policy: headPolicyFor({ engine, precedence: PROJECT, liveProjectRoot: root }),
      configRelativePath: 'languages/typescript/preset/eslint-config/policies/errors.config.mjs',
    });

    expect(rulesOf(findings)).toEqual(NITPICKER_RULES);
  });

  it('is read from the head checkout for the base snapshot too', () => {
    const head = projects.create({ ...SOURCES, ...PROJECT_FILES });
    const base = projects.create({
      ...SOURCES,
      'eslint.config.mjs': "export default [{ rules: { 'no-debugger': 'error' } }];\n",
      'src/debugger.ts': 'debugger;\n',
    });
    const config = { tools: { eslint: { engine, precedence: PROJECT } } };
    const headPolicy = headPolicyFor({ engine, precedence: PROJECT, liveProjectRoot: head });
    const basePolicy = withHeadCheckoutFacts(resolveHeadPolicy(config), headPolicy);

    expect(basePolicy.tools.eslint).toEqual(headPolicy.tools.eslint);
    expect(
      rulesOf(lintLayered({ projectRoot: base, liveProjectRoot: head, policy: basePolicy })),
    ).toEqual([...NITPICKER_RULES, 'src/equal.ts eqeqeq', 'src/named.ts house/no-bar'].toSorted());
  });

  it('loads a TypeScript config through the jiti the project installs', () => {
    const root = projects.create({
      ...SOURCES,
      'eslint.config.mts': "export default [{ rules: { eqeqeq: 'error' } }];\n",
      'node_modules/jiti/package.json': JSON.stringify({ name: 'jiti', main: 'index.js' }),
      'node_modules/jiti/index.js': JITI_STUB,
    });
    const findings = lintLayered({
      projectRoot: root,
      policy: headPolicyFor({ engine, precedence: ['project'], liveProjectRoot: root }),
    });

    expect(findings.filter(({ ruleId }) => ruleId === 'eqeqeq')).toEqual([
      { file: 'src/equal.ts', ruleId: 'eqeqeq', line: 1 },
    ]);
  });

  it.each([
    ['export default [{ rules: {', 'ESLint config eslint.config.mjs could not be loaded:'],
    [
      'export default 42;',
      'ESLint config eslint.config.mjs must export a flat config array or object',
    ],
    ["export default [{ rules: { eqeqeq: 'loud' } }];", /"eqeqeq".*(?:invalid|severity)/u],
  ])('fails the analyzer for the malformed config %s', (text, message) => {
    const root = projects.create({ ...SOURCES, 'eslint.config.mjs': `${text}\n` });
    const policy = headPolicyFor({ engine, precedence: PROJECT, liveProjectRoot: root });

    expect(() => lintLayered({ projectRoot: root, policy })).toThrow(message);
  });
});

describe('a missing ESLint project config', () => {
  it.each([[['project']], [['nitpicker', 'project']]])(
    'is a tool error when the precedence is %j',
    (precedence) => {
      const root = projects.create(SOURCES);
      const policy = headPolicyFor({ engine: 'oxlint', precedence, liveProjectRoot: root });

      expect(policy.tools.eslint).toEqual({
        engine: 'oxlint',
        precedence,
        projectConfigMissing: true,
      });
      expect(() => lintLayered({ projectRoot: root, policy })).toThrow(
        '"tools.eslint.precedence" lists "project" but an ESLint flat config at the project root (eslint.config.js, eslint.config.mjs, eslint.config.cjs, eslint.config.ts, eslint.config.mts, eslint.config.cts) is missing: create it, or remove "project" from tools.eslint.precedence',
      );
    },
  );
});
