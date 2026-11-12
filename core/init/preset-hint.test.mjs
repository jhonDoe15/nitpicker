import { describe, expect, it } from 'vitest';
import { runCli as nitpickerCli } from '../cli.mjs';
import { fakeAnalyzer, useCliFixtures } from '../command/test-support/cli-harness.mjs';
import { policy } from '../diff/execution/test-support/analyzer-findings.mjs';
import { captureOutput } from '../diff/reporting/test-support/output-capture.mjs';

const { createRepository, makeOutputRoot, runCli } = useCliFixtures(nitpickerCli);
const HINT_START =
  'nitpicker: no "preset" is set, so the TypeScript preset runs, but these sources';

function stderrOf(files) {
  const repository = createRepository({ 'quality-policy.json': policy(), ...files });
  const output = captureOutput();
  runCli({
    arguments_: ['--base', repository.baseRef, '--output', makeOutputRoot()],
    environment: {},
    currentProjectRoot: repository.root,
    analyzers: [fakeAnalyzer()],
    stdout: output.stdout,
    stderr: output.stderr,
  });
  return output.stderrText;
}

describe('a run without a preset', () => {
  it('hints at the javascript preset on stderr for a JavaScript project', () => {
    expect(stderrOf({ 'src/main/clean.js': 'export const clean = true;\n' })).toBe(
      `${HINT_START} are JavaScript (no TypeScript files or tsconfig.json). Add "preset": "javascript" to nitpicker.config.json, or run \`nitpicker init\`.\n`,
    );
  });

  it('says nothing for a TypeScript project', () => {
    expect(stderrOf({ 'src/main/clean.ts': 'export const clean = true;\n' })).toBe('');
  });

  it('says nothing once the preset is declared', () => {
    const files = {
      'nitpicker.config.json': '{ "preset": "javascript" }\n',
      'src/main/clean.js': 'export const clean = true;\n',
    };

    expect(stderrOf(files)).toBe('');
  });
});
