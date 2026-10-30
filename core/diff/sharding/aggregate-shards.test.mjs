import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import { readJson } from '../git/test-support/fixture-files.mjs';
import { useGitFixtures } from '../git/test-support/git-repository.mjs';
import { exactText } from '../reporting/test-support/output-expectations.mjs';
import { docsUrl } from '../../../shared/messages/docs-url.mjs';
import { aggregateShardReports } from './aggregate-shards.mjs';
import { analyzer, useShardFixtures, writeShard } from './test-support/shard-fixtures.mjs';

const { createFixture } = useShardFixtures();
const { createGitRepository } = useGitFixtures();

const HELD_STRUCTURE_NOTE = [
  'structure/function-lines-limit src/main/invoice.ts',
  'computeInvoice has 68 lines; limit is 50',
  '(allowed because base was 68; any increase fails)',
].join(' ');

describe('quality shard aggregation', () => {
  it('merges complete shards into one ordered report and final gate', () => {
    const fixture = createFixture();
    const analyzers = [
      analyzer('largest', { shardWeight: 9 }),
      analyzer('coverage', { shardWeight: 6 }),
      analyzer('crap', { dependencies: ['coverage'], shardWeight: 2 }),
      analyzer('medium', { shardWeight: 5 }),
      analyzer('small', { shardWeight: 4 }),
    ];
    const finding = {
      tool: 'small',
      rule: 'example',
      path: 'src/main/example.ts',
      identity: 'example',
      message: 'example finding',
      classification: 'enforceable',
    };
    writeShard(fixture.inputRoot, 0, { tools: ['largest'], elapsedMs: 30 });
    writeShard(fixture.inputRoot, 1, {
      tools: ['coverage', 'crap'],
      elapsedMs: 40,
    });
    writeShard(fixture.inputRoot, 2, {
      tools: ['medium', 'small'],
      findings: [finding],
      elapsedMs: 20,
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers,
      shardCount: 3,
    });

    expect(report.summary.tools.map(({ name }) => name)).toEqual(analyzers.map(({ name }) => name));
    expect(report.summary.elapsedMs).toBe(40);
    expect(report.summary.newEnforceableFindings).toBe(1);
    expect(report.newFindings).toEqual([finding]);
    expect(readJson(fixture.outputRoot, 'summary.json')).toEqual(report.summary);
    expect(readFileSync(path.join(fixture.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expect.stringMatching(exactText`Nitpicker quality diff
Base ref: origin/master
Merge base: merge-base
Head: head
Status: completed
New enforceable findings: 1
New findings: 1
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
largest: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
coverage: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
crap: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
medium: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
small: base=0 head=0 new=1 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

New findings:
small/example src/main/example.ts example finding
`),
    );
  });
  it('carries the policy changes and notices of the shards into the report', () => {
    const fixture = createFixture();
    const carried = {
      policyChanges: ['exclude added: src/vendor/**'],
      notices: ['1 changed TypeScript file is outside layout.sourceRoots'],
      policyLoosenings: ['exclude added: src/vendor/**'],
      policyChangeAccepted: false,
    };
    const loosening = {
      tool: 'nitpicker-config',
      rule: 'policy-loosened',
      path: 'nitpicker.config.json',
      identity: 'exclude added: src/vendor/**',
      message: 'exclude added: src/vendor/**. Stop and ask a person to review this change.',
      classification: 'enforceable',
    };
    writeShard(fixture.inputRoot, 0, { tools: ['first'], findings: [loosening], carried });
    writeShard(fixture.inputRoot, 1, { tools: ['second'], carried });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [analyzer('first'), analyzer('second')],
      shardCount: 2,
    });
    const summary = readJson(fixture.outputRoot, 'summary.json');
    const text = readFileSync(path.join(fixture.outputRoot, 'report.txt'), 'utf8').split('\n');
    const heading = 'Policy changed in this change (nitpicker.config.json, head against base):';
    const start = text.indexOf(heading);

    const fields = (entry) => Object.keys(carried).map((key) => entry[key]);

    expect(fields(report.summary)).toEqual(Object.values(carried));
    expect(fields(summary)).toEqual(Object.values(carried));
    expect([report.newFindings, report.summary.newEnforceableFindings]).toEqual([[loosening], 1]);
    expect(text.slice(start, start + 5)).toEqual([
      heading,
      '  exclude added: src/vendor/**',
      '',
      'Notices (not failing):',
      '  1 changed TypeScript file is outside layout.sourceRoots',
    ]);
  });

  it('carries the held findings of every shard into the report and its note', () => {
    const fixture = createFixture();
    const held = {
      tool: 'structure',
      rule: 'function-lines-limit',
      path: 'src/main/invoice.ts',
      identity: 'function:computeInvoice',
      message: 'computeInvoice has 68 lines; limit is 50',
      classification: 'enforceable',
      heldAtBase: 68,
      ratchet: { key: 'k', value: 68, worseMessage: 'grew from {base}' },
    };
    writeShard(fixture.inputRoot, 0, { tools: ['structure'], held: [held] });
    writeShard(fixture.inputRoot, 1, { tools: ['other'] });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [analyzer('structure'), analyzer('other')],
      shardCount: 2,
    });

    expect(report.unchangedFindings).toEqual([held]);
    expect(readJson(fixture.outputRoot, 'held-findings.json')).toEqual([
      { ...held, helpUri: docsUrl('docs/rules/checks.md', 'structure-function-lines-limit') },
    ]);
    expect(readFileSync(path.join(fixture.outputRoot, 'report.txt'), 'utf8')).toEqual(
      expect.stringMatching(exactText`Nitpicker quality diff
Base ref: origin/master
Merge base: merge-base
Head: head
Status: completed
New enforceable findings: 0
New findings: 0
Resolved findings: 0
Unchanged findings: 0
Changed metrics: 0
Tool errors: 0

Per-tool counts:
structure: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s
other: base=0 head=0 new=0 resolved=0 unchanged=0 changed-metrics=0 elapsed=${/[0-9]+(?:\.[0-9]+)?/}s

Touched, still over limit (not failing):
${HELD_STRUCTURE_NOTE}
`),
    );
  });
  it('merges the red-base notes of every shard, in tool order, and writes them out', () => {
    const fixture = createFixture();
    const note = (tool) => ({
      tool,
      snapshot: 'base',
      rule: 'tests-failed',
      path: '.',
      message: `${tool} tests fail on the base`,
    });
    writeShard(fixture.inputRoot, 0, { tools: ['python'], notes: [note('python')] });
    writeShard(fixture.inputRoot, 1, { tools: ['java'], notes: [note('java')] });
    writeShard(fixture.inputRoot, 2, { tools: ['other'] });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [analyzer('python'), analyzer('java'), analyzer('other')],
      shardCount: 3,
    });

    expect(report.notes).toEqual([note('java'), note('python')]);
    expect(readJson(fixture.outputRoot, 'notes.json')).toEqual([note('java'), note('python')]);
  });

  it('uses the shard head policy when the live inventory has uncommitted changes', () => {
    const fixture = createFixture();
    const { root: repositoryRoot, baseSha: headSha } = createGitRepository(
      { 'project/nitpicker.legacy.json': '{"sites":["head"]}' },
      { prefix: 'nitpicker-shard-repository-' },
    );
    const liveProjectRoot = path.join(repositoryRoot, 'project');
    writeFileSync(path.join(liveProjectRoot, 'nitpicker.legacy.json'), '{"sites":["live"]}');

    const codingStandards = analyzer('coding-standards');
    codingStandards.resolveVersion = () => '1.0.0';
    codingStandards.resolveConfigurationHash = (root) =>
      readFileSync(path.join(root, 'nitpicker.legacy.json'), 'utf8');
    const headPolicyHash = '{"sites":["head"]}';
    writeShard(fixture.inputRoot, 0, {
      tools: ['coding-standards'],
      headSha,
      configurationHashes: { 'coding-standards': headPolicyHash },
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [codingStandards],
      shardCount: 1,
      liveProjectRoot,
    });

    expect(report.summary.overallStatus).toBe('completed');
    expect(report.summary.tools[0].configurationHash).toBe(headPolicyHash);
  });
  it.each([
    ['a repository subfolder', 'project', 'project/src/a.ts'],
    ['the repository root', '.', 'src/a.ts'],
  ])('gives the SARIF source root and paths of a project in %s', (_name, folder, uri) => {
    const fixture = createFixture();
    const { root: repositoryRoot } = createGitRepository(
      { 'project/README.md': 'project\n' },
      { prefix: 'nitpicker-shard-source-root-' },
    );
    const finding = {
      tool: 'first',
      rule: 'example',
      path: 'src/a.ts',
      identity: 'example',
      message: 'example finding',
      classification: 'enforceable',
    };
    writeShard(fixture.inputRoot, 0, { tools: ['first'], findings: [finding] });

    aggregateShardReports({
      ...fixture,
      analyzers: [analyzer('first')],
      shardCount: 1,
      liveProjectRoot: path.join(repositoryRoot, folder),
    });

    const [run] = readJson(fixture.outputRoot, 'report.sarif').runs;
    expect(
      run.results.map((result) => result.locations[0].physicalLocation.artifactLocation),
    ).toEqual([{ uri, uriBaseId: '%SRCROOT%' }]);
    expect(run.originalUriBaseIds).toEqual({
      '%SRCROOT%': {
        uri: `${pathToFileURL(repositoryRoot).href}/`,
        description: { text: 'The root of the git repository the findings are in.' },
      },
    });
  });
  it('writes no SARIF source root without the live project root', () => {
    const fixture = createFixture();
    writeShard(fixture.inputRoot, 0, { tools: ['first'] });

    aggregateShardReports({ ...fixture, analyzers: [analyzer('first')], shardCount: 1 });

    expect(readJson(fixture.outputRoot, 'report.sarif').runs[0].originalUriBaseIds).toBeUndefined();
  });
  it('records shard-classified analyzer tool errors without aborting aggregation', () => {
    const fixture = createFixture();
    const error = {
      tool: 'missing-tool',
      snapshot: 'head',
      message: 'Required tool missing-tool is not installed',
    };
    const missingTool = analyzer('missing-tool');
    missingTool.version = 'unresolved';
    missingTool.resolveVersion = () => {
      throw new Error(error.message);
    };
    writeShard(fixture.inputRoot, 0, {
      tools: ['missing-tool'],
      toolErrors: [error],
      toolVersions: { 'missing-tool': 'unknown' },
      overallStatus: 'tool-error',
    });

    const report = aggregateShardReports({
      ...fixture,
      analyzers: [missingTool],
      shardCount: 1,
      liveProjectRoot: PACKAGE_ROOT,
    });

    expect(report.summary.overallStatus).toBe('tool-error');
    expect(report.summary.tools[0].version).toBe('unknown');
    expect(report.toolErrors).toEqual([error]);
  });
  it('rejects a missing shard instead of silently reducing analyzer coverage', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/shard 1.*summary\.json/i);
  });
  it('rejects misassigned shard reports', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });
    writeShard(fixture.inputRoot, 1, { tools: ['a'] });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/expected analyzers b/i);
  });
  it('rejects shard reports produced from different commits', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('a'), analyzer('b')];
    writeShard(fixture.inputRoot, 0, { tools: ['a'] });
    writeShard(fixture.inputRoot, 1, { tools: ['b'], headSha: 'stale-head' });

    expect(() =>
      aggregateShardReports({
        ...fixture,
        analyzers,
        shardCount: 2,
      }),
    ).toThrow(/shard 1 headSha does not match shard 0/i);
  });
});
