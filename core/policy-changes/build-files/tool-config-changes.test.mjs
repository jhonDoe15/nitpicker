import { describe, expect, it } from 'vitest';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mjs';
import { policyChangeFields } from '../describe-policy-changes.mjs';
import { readPolicyScope } from '../policy-scope.mjs';

const { createGitRepository } = useGitFixtures();
const PROJECT = { precedence: ['project', 'nitpicker'] };

function between({ base, head, config }) {
  const scope = readPolicyScope({
    baseConfig: config,
    headConfig: config,
    baseProjectRoot: createGitRepository(base).root,
    headProjectRoot: createGitRepository(head).root,
  });
  return policyChangeFields(config, config, scope);
}

describe('project tool configs the project opted into', () => {
  const java = { preset: 'java', tools: { pmd: PROJECT, checkstyle: PROJECT } };
  const files = (ruleset, checkstyle = '<module/>') => ({
    'config/pmd/ruleset.xml': ruleset,
    'config/checkstyle/checkstyle.xml': checkstyle,
    'config/checkstyle/suppressions.xml': '<suppressions/>',
    'src/main/java/A.java': 'class A {}\n',
  });

  it('counts an edit of any file in the PMD or Checkstyle config folder as loosening', () => {
    const base = files('<ruleset a="1"/>');
    const head = {
      ...files('<ruleset a="2"/>'),
      'config/checkstyle/suppressions.xml': '<suppressions a="1"/>',
    };

    expect(between({ base, head, config: java }).policyLoosenings).toEqual([
      'pmd project config changed: config/pmd/ruleset.xml',
      'checkstyle project config changed: config/checkstyle/suppressions.xml',
    ]);
  });

  it('stays quiet for an unchanged config, a tool the project did not opt into and a removed file', () => {
    const base = files('<ruleset/>');
    const removed = (({ 'config/pmd/ruleset.xml': _gone, ...rest }) => rest)(files('<ruleset/>'));

    expect(between({ base, head: files('<ruleset/>'), config: java }).policyLoosenings).toEqual([]);
    expect(
      between({ base, head: files('<ruleset a="2"/>'), config: { preset: 'java' } })
        .policyLoosenings,
    ).toEqual([]);
    expect(between({ base, head: removed, config: java })).toMatchObject({
      policyLoosenings: [],
      policyChanges: ['pmd project config removed: config/pmd/ruleset.xml'],
    });
  });

  it('counts an edit of the detekt config the Kotlin preset layers', () => {
    const kotlin = { preset: 'kotlin' };
    const at = (text) => ({
      'config/detekt/detekt.yml': text,
      'src/main/kotlin/A.kt': 'class A\n',
    });

    expect(
      between({ base: at('a: 1\n'), head: at('a: 2\n'), config: kotlin }).policyLoosenings,
    ).toEqual(['detekt project config changed: config/detekt/detekt.yml']);
    expect(
      between({ base: at('a: 1\n'), head: at('a: 1\n'), config: kotlin }).policyLoosenings,
    ).toEqual([]);
  });

  it('counts an edit of the Prettier config the project opted into, and only its own key in package.json', () => {
    const typescript = { tools: { prettier: PROJECT } };
    const at = (prettierrc, packageJson) => ({
      '.prettierrc': prettierrc,
      'package.json': JSON.stringify(packageJson),
      'src/a.ts': 'export const a = 1;\n',
    });
    const base = at('{"semi":true}', { name: 'x', version: '1.0.0' });

    expect(
      between({
        base,
        head: at('{"semi":false}', { name: 'x', version: '1.0.0' }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual(['prettier project config changed: .prettierrc']);
    expect(
      between({
        base,
        head: at('{"semi":true}', { name: 'x', version: '2.0.0' }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual([]);
    expect(
      between({
        base,
        head: at('{"semi":true}', { name: 'x', version: '1.0.0', prettier: { semi: false } }),
        config: typescript,
      }).policyLoosenings,
    ).toEqual(['prettier project config changed: package.json']);
  });
});
