import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDesignSignals } from './design-signals.mjs';

const ANALYZER = 'languages/typescript/preset/design/analyze.mjs';
const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';
let directory;
let options;

function write(files) {
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(directory, name)), { recursive: true });
    writeFileSync(path.join(directory, name), text);
  }
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-design-runner-'));
  write({
    'policy.json': JSON.stringify({ exclude: [], layout: {}, exceptions: [], thresholds: {} }),
    [`policy/${TYPESCRIPT_CONFIG}`]: '{}',
    [`policy/${ANALYZER}`]:
      "export function analyzeDesignSignals() { throw new Error('no program'); }\n",
    'project/package.json': '{"name":"app","private":true}',
  });
  vi.stubEnv('NITPICKER_POLICY', path.join(directory, 'policy.json'));
  options = {
    projectRoot: path.join(directory, 'project'),
    policyRoot: path.join(directory, 'policy'),
    analyzerName: 'structure',
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

describe('the design signals runner', () => {
  it('turns a failed analysis into a tool error instead of failing the analyzer', async () => {
    expect(await runDesignSignals(options)).toEqual([
      {
        tool: 'structure',
        rule: 'design-signals',
        path: '.',
        identity: 'design-signals',
        message: 'design-signals could not run: no program',
        classification: 'tool-error',
      },
    ]);
  });
});
