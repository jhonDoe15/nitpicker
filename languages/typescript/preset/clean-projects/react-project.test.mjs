import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { createCleanProject, readReport, runNitpicker } from './test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, '../fixtures/react-project');
const FIXTURE_TIMEOUT_MS = 300_000;
const testRulePattern = /^(?:testing-library\/|nitpicker\/react-test-)/;

function rulesByFile(findings, directory = 'src/') {
  const rules = {};
  for (const { rule, path: file } of findings) {
    if (file.startsWith(directory)) {
      const name = path.basename(file, '.tsx');
      rules[name] = [...new Set([...(rules[name] ?? []), rule])].toSorted();
    }
  }
  return rules;
}

function testRulesByFile(findings) {
  return rulesByFile(
    findings.filter(({ rule }) => testRulePattern.test(rule)),
    'test/',
  );
}

function messageOf(findings, rule) {
  return findings.find((finding) => finding.rule === rule)?.message;
}

describe('the react-project fixture', () => {
  const temporaryRoots = [];
  let gitTemplateRoot;

  beforeAll(() => {
    gitTemplateRoot = createGitTemplate();
  });

  afterEach(() => {
    for (const root of temporaryRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function commitProject({ manifest, config }) {
    const files = {
      ...(manifest === undefined ? {} : { 'package.json': JSON.stringify(manifest) }),
      ...(config === undefined ? {} : { 'nitpicker.config.json': JSON.stringify(config) }),
    };
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'react-project', files });
    temporaryRoots.push(root);
    return root;
  }

  function lintFindings(root) {
    const exitCode = runNitpicker(root, [
      '--all',
      '--analyzer',
      'eslint-lint',
      '--output',
      path.join(root, 'reports/snapshot'),
    ]).exitCode;
    return { exitCode, findings: readReport(root, 'reports/snapshot/findings.json') };
  }

  it(
    'flags each banned form with its rule, passes the allowed file and leaves tests without React alone',
    () => {
      const { exitCode, findings } = lintFindings(commitProject({}));

      expect(testRulesByFile(findings)).toEqual({
        'container-query.test': ['testing-library/no-node-access'],
        'fire-event.test': ['testing-library/prefer-user-event'],
        'internals.test': ['nitpicker/react-test-no-implementation-details'],
        'test-id.test': ['testing-library/no-test-id-queries'],
        'unawaited-event.test': ['testing-library/await-async-events'],
        'wrapper-container.test': ['testing-library/no-node-access'],
      });
      expect(rulesByFile(findings)).toEqual({
        'class-component': ['react-x/no-class-component'],
        'conditional-hook': ['react-hooks/rules-of-hooks'],
        'derived-state': ['nitpicker/react-no-effect-derived-state'],
        'effect-fetch': ['nitpicker/react-no-effect-data-fetching'],
        inaccessible: [
          'jsx-a11y/alt-text',
          'jsx-a11y/click-events-have-key-events',
          'jsx-a11y/no-noninteractive-element-interactions',
        ],
        'index-key': ['react-x/no-array-index-key'],
        'hard-coded-color': ['nitpicker/react-no-hardcoded-colors'],
        'inline-style': ['nitpicker/react-single-styling-approach'],
        'missing-dependency': ['react-hooks/exhaustive-deps'],
      });
      expect(exitCode).toBe(1);
    },
    FIXTURE_TIMEOUT_MS,
  );

  it('applies no React rule to a project that does not depend on react, whatever the exceptions say', () => {
    const { findings } = lintFindings(
      commitProject({
        manifest: { private: true },
        config: {
          exceptions: [
            { rule: 'react-hooks/exhaustive-deps', paths: ['src/**'], reason: 'Legacy hooks' },
          ],
        },
      }),
    );

    const folder = 'nitpicker/no-unknown-main-folder';
    const naming = 'nitpicker/naming-convention';
    expect(rulesByFile(findings)).toEqual({
      allowed: ['@typescript-eslint/no-misused-promises', naming, 'nitpicker/no-null', folder],
      'class-component': [folder, 'no-restricted-syntax'],
      'conditional-hook': [naming, folder],
      'css-properties.ts': [folder],
      'derived-state': [naming, folder],
      'effect-fetch': [naming, folder],
      'hard-coded-color': [naming, folder],
      inaccessible: [naming, folder],
      'index-key': [naming, folder],
      'inline-style': [naming, folder],
      'missing-dependency': [naming, folder],
    });
  });

  it(
    'names the configured styling approach',
    () => {
      const { findings } = lintFindings(
        commitProject({ config: { react: { styling: 'css-in-js' } } }),
      );

      expect(messageOf(findings, 'nitpicker/react-single-styling-approach')).toBe(
        [
          'Style with styled components (styled-components or Emotion), not an inline `style` object.',
          "Pass a runtime value as a CSS custom property, `style={{ '--progress': percent }}`,",
          'typed once in a `.d.ts` file under src/ with',
          "`declare module 'csstype' { interface Properties { '--progress'?: number } }`.",
          'For a one-off, add an exception for this rule in nitpicker.config.json.',
        ].join(' '),
      );
    },
    FIXTURE_TIMEOUT_MS,
  );
});
