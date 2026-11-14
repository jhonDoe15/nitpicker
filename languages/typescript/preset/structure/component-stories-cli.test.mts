import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { docsUrl as untypedDocsUrl } from '../../../../shared/messages/docs-url.mjs';
import {
  readReport,
  runNitpicker,
  useCleanProjects,
} from '../clean-projects/test-support/clean-project.mts';
import { fieldOf, listOf } from '../../../../shared/values/readers.mts';

const docsUrl: (page: string, anchor: string) => string | undefined = untypedDocsUrl;

const fixtureRoot = path.join(import.meta.dirname, 'fixtures/storybook-project');

describe('component-story-missing through the CLI', () => {
  const { createProject } = useCleanProjects(process.env);

  it('reports the component without a story in a Storybook project where most components have one', () => {
    const root = createProject({ fixtureRoot, name: 'storybook-project' });
    const { exitCode } = runNitpicker(root, [
      '--all',
      '--analyzer',
      'structure',
      '--output',
      path.join(root, 'reports/snapshot'),
    ]);
    const findings = listOf(readReport(root, 'reports/snapshot/findings.json')).filter(
      (finding) => fieldOf(finding, 'rule') === 'component-story-missing',
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
        allowedForm: 'Add src/Table.stories.tsx for Table.',
        exception: {
          rule: 'component-story-missing',
          paths: ['src/Table.tsx'],
          reason: '...',
        },
        exceptionList: 'exceptions',
        classification: 'enforceable',
        helpUri: docsUrl('docs/rules/checks.md', 'structure-component-story-missing'),
      },
    ]);
    expect(exitCode).not.toBe(0);
  });
});
