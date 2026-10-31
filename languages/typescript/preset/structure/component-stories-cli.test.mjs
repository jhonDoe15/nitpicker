import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createGitTemplate } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { docsUrl } from '../../../../shared/messages/docs-url.mjs';
import {
  createCleanProject,
  readReport,
  runNitpicker,
} from '../clean-projects/test-support/clean-project.mjs';

const fixtureRoot = path.join(import.meta.dirname, 'fixtures/storybook-project');

describe('component-story-missing through the CLI', () => {
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

  it('reports the component without a story in a Storybook project where most components have one', () => {
    const root = createCleanProject({ fixtureRoot, gitTemplateRoot, name: 'storybook-project' });
    temporaryRoots.push(root);
    const { exitCode } = runNitpicker(root, [
      '--all',
      '--analyzer',
      'structure',
      '--output',
      path.join(root, 'reports/snapshot'),
    ]);
    const findings = readReport(root, 'reports/snapshot/findings.json').filter(
      ({ rule }) => rule === 'component-story-missing',
    );

    expect(findings).toEqual([
      {
        tool: 'structure',
        rule: 'component-story-missing',
        path: 'src/Table.tsx',
        identity: 'component-story-missing:Table',
        location: { line: 1 },
        message:
          'Most components in this project have a story. Add src/Table.stories.tsx for Table. If this is intended, add {"rule":"component-story-missing","paths":["src/Table.tsx"],"reason":"..."} to "exceptions" in nitpicker.config.json.',
        classification: 'enforceable',
        helpUri: docsUrl('docs/rules/checks.md', 'structure-component-story-missing'),
      },
    ]);
    expect(exitCode).not.toBe(0);
  });
});
