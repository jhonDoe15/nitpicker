import { exactText } from '../fixtures/output-expectations.mjs';
import { createGitTemplate, copyGitTemplate } from '../fixtures/git-repository.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, afterEach, describe, expect, it } from 'vitest';
import { aggregateShardReports } from './aggregate-shards.mjs';
import { PACKAGE_ROOT } from '../../tooling/tool-resolution.mjs';
import {
  analyzer,
  createFixture,
  readJson,
  removeFixtures,
  writeShard,
} from './shard-fixtures.mjs';

afterEach(removeFixtures);

const HELD_STRUCTURE_NOTE = [
  'structure/function-lines-limit src/main/invoice.ts',
  'computeInvoice has 68 lines; limit is 50',
  '(allowed because base was 68; any increase fails)',
].join(' ');

function runGitCommand(repositoryRoot, arguments_) {
  const result = spawnSync('git', arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'git command failed');
  }
  return result.stdout.trim();
}

const gitTemplate = { root: undefined };
beforeAll(() => {
  gitTemplate.root = createGitTemplate();
});

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
    expect(readJson(fixture.outputRoot, 'held-findings.json')).toEqual([held]);
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
  it('uses the shard head policy when the live inventory has uncommitted changes', () => {
    const fixture = createFixture();
    const repositoryRoot = path.join(path.dirname(fixture.inputRoot), 'repository');
    const liveProjectRoot = path.join(repositoryRoot, 'project');
    const inventoryPath = path.join(liveProjectRoot, 'nitpicker.legacy.json');
    mkdirSync(liveProjectRoot, { recursive: true });
    writeFileSync(inventoryPath, '{"sites":["head"]}');
    copyGitTemplate(gitTemplate.root, repositoryRoot);
    runGitCommand(repositoryRoot, ['config', 'user.name', 'Nitpicker Test']);
    runGitCommand(repositoryRoot, ['config', 'user.email', 'nitpicker-test@example.com']);
    runGitCommand(repositoryRoot, ['add', '--all']);
    runGitCommand(repositoryRoot, ['commit', '--quiet', '-m', 'head policy']);
    const headSha = runGitCommand(repositoryRoot, ['rev-parse', 'HEAD']);
    writeFileSync(inventoryPath, '{"sites":["live"]}');

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
