import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runAggregateCli } from './aggregate-shards.mjs';
import {
  analyzer,
  captureOutput,
  createFixture,
  removeFixtures,
  writeShard,
} from './shard-fixtures.mjs';
import { fileURLToPath } from 'node:url';

afterEach(removeFixtures);

describe('quality shard aggregation command', () => {
  it('returns the combined enforceable gate status', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, {
      tools: ['only'],
      findings: [
        {
          tool: 'only',
          rule: 'example',
          path: 'src/main/example.ts',
          identity: 'example',
          message: 'example finding',
          classification: 'enforceable',
        },
      ],
    });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {},
    });

    expect(exitCode).toBe(1);
    expect(output.stdoutText).toEqual(`
\u001b[1m\u001b[31mQuality gate summary\u001b[0m
\u001b[1m\u001b[31m✖ 1 new enforceable violation\u001b[0m
  \u001b[33monly/example\u001b[0m src/main/example.ts
    example finding
\u001b[2mFull diagnostics: ${fixture.outputRoot}/report.txt\u001b[0m
`);
    expect(output.stdoutText).not.toContain('Per-tool counts:');
    expect(output.stderrText).toBe('');
  });
  it.each([
    ['findings plus a tool error', true, true, 1],
    ['a tool error only', false, true, 2],
    ['findings only', true, false, 1],
    ['a clean run', false, false, 0],
  ])('exits per the combined result for %s', (_name, withFinding, withToolError, expected) => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, {
      tools: ['only'],
      findings: withFinding
        ? [
            {
              tool: 'only',
              rule: 'example',
              path: 'src/main/example.ts',
              identity: 'example',
              message: 'example finding',
              classification: 'enforceable',
            },
          ]
        : [],
      toolErrors: withToolError
        ? [{ tool: 'only', rule: 'tool-error', path: '', identity: 'boom', message: 'boom' }]
        : [],
      overallStatus: withToolError ? 'tool-error' : 'completed',
    });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: {},
    });

    expect(exitCode).toBe(expected);
    const summary = JSON.parse(
      readFileSync(path.join(path.dirname(fixture.inputRoot), 'combined/summary.json'), 'utf8'),
    );
    expect(summary.overallStatus).toBe(withToolError ? 'tool-error' : 'completed');
  });
  it('supports a concise color-free success summary', () => {
    const fixture = createFixture();
    const analyzers = [analyzer('only')];
    writeShard(fixture.inputRoot, 0, { tools: ['only'] });
    const output = captureOutput();

    const exitCode = runAggregateCli({
      arguments_: ['--input-root', 'shards', '--shard-count', '1', '--output', 'combined'],
      currentProjectRoot: path.dirname(fixture.inputRoot),
      analyzers,
      stdout: output.stdout,
      stderr: output.stderr,
      environment: { NO_COLOR: '1' },
    });

    expect(exitCode).toBe(0);
    expect(output.stdoutText).toEqual(`
Quality gate summary
✓ No new enforceable violations
Full diagnostics: ${fixture.outputRoot}/report.txt
`);
    expect(output.stdoutText).not.toContain('\u001B[');
    expect(output.stderrText).toBe('');
  });
  it('starts without importing any development dependency', () => {
    const fixture = createFixture();
    const loaderPath = path.join(path.dirname(fixture.inputRoot), 'block-packages-loader.mjs');
    writeFileSync(
      loaderPath,
      [
        'export function resolve(specifier, context, nextResolve) {',
        "  if (!specifier.startsWith('.') && !specifier.startsWith('/') &&",
        "      !specifier.startsWith('file:') && !specifier.startsWith('node:')) {",
        '    throw new Error(`Blocked external package: ${specifier}`);',
        '  }',
        '  return nextResolve(specifier, context);',
        '}',
      ].join('\n'),
    );

    const result = spawnSync(
      process.execPath,
      [
        '--experimental-loader',
        loaderPath,
        fileURLToPath(new URL('./aggregate-shards.mjs', import.meta.url)),
        '--help',
      ],
      { encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe(
      'Usage: node core/diff/sharding/aggregate-shards.mjs --input-root <directory> --shard-count <count> [--output <directory>] [--policy-root <directory>]\n',
    );
  });
});
