import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTestOnlyExports, runUnusedApi } from './unused-api.mjs';

const ANALYZER = 'languages/typescript/preset/unused-api/analyze.mjs';
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
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-unused-api-runner-'));
  write({
    'policy.json': JSON.stringify({ exclude: [], layout: {}, exceptions: [], thresholds: {} }),
    [`policy/${TYPESCRIPT_CONFIG}`]: '{}',
    [`policy/${ANALYZER}`]:
      "export function analyzeUnusedApi() { throw new Error('no program'); }\n",
    'project/package.json': '{"name":"app","private":true}',
    'project/src/a.test.ts': 'export const a = 1;\n',
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

describe('the unused API runners', () => {
  it('turns a failed analysis into a tool error instead of failing the analyzer', async () => {
    expect(await runUnusedApi(options)).toEqual([
      {
        tool: 'structure',
        rule: 'unused-api',
        path: '.',
        identity: 'unused-api',
        message: 'unused-api could not run: no program',
        classification: 'tool-error',
      },
    ]);
  });

  it('turns a failed knip run without tests into a tool error', () => {
    const runs = {
      config: { entry: [], project: [] },
      normal: { issues: [] },
      knip: () => {
        throw new Error('knip exited with 2');
      },
    };

    expect(runTestOnlyExports({ ...options, analyzerName: 'dead-code' }, runs)).toEqual([
      {
        tool: 'dead-code',
        rule: 'test-only-export',
        path: '.',
        identity: 'test-only-export',
        message: 'test-only-export could not run: knip exited with 2',
        classification: 'tool-error',
      },
    ]);
  });
});
