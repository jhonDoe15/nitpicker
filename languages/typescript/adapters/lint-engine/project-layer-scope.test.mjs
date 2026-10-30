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

const NITPICKER_RULES = [
  'src/console.ts nitpicker/no-foo',
  'src/loose.ts directive',
  'src/params.ts max-params',
  'src/strict/locked.ts directive',
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

  it('fails the analyzer for a config ESLint rejects', () => {
    const root = projects.create({
      ...SOURCES,
      'eslint.config.mjs': "export default [{ rules: { eqeqeq: 'loud' } }];\n",
    });
    const policy = headPolicyFor({ engine, precedence: PROJECT, liveProjectRoot: root });

    expect(() => lintLayered({ projectRoot: root, policy })).toThrow(
      /"eqeqeq".*Expected severity of "off", 0, "warn", 1, "error", or 2\./su,
    );
  });
});

describe('the ESLint project config of a base snapshot', () => {
  it('is read from the head checkout', () => {
    const head = projects.create({ ...SOURCES, ...PROJECT_FILES });
    const base = projects.create({
      ...SOURCES,
      'eslint.config.mjs': "export default [{ rules: { 'no-debugger': 'error' } }];\n",
      'src/debugger.ts': 'debugger;\n',
    });
    const config = { tools: { eslint: { engine: 'oxlint', precedence: PROJECT } } };
    const headPolicy = headPolicyFor({
      engine: 'oxlint',
      precedence: PROJECT,
      liveProjectRoot: head,
    });
    const basePolicy = withHeadCheckoutFacts(resolveHeadPolicy(config), headPolicy);

    expect(basePolicy.tools.eslint).toEqual(headPolicy.tools.eslint);
    expect(
      rulesOf(lintLayered({ projectRoot: base, liveProjectRoot: head, policy: basePolicy })),
    ).toEqual([...NITPICKER_RULES, 'src/equal.ts eqeqeq', 'src/named.ts house/no-bar'].toSorted());
  });
});
