import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const moduleUrl = new URL('./temporary-files.mjs', import.meta.url).href;
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function runScenario(body) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-temporary-files-'));
  temporaryRoots.push(root);
  const target = path.join(root, '.nitpicker-test.json');
  const script = [
    `import { writeFileSync } from 'node:fs';`,
    `import { trackTemporaryPath, untrackTemporaryPath } from ${JSON.stringify(moduleUrl)};`,
    `const target = ${JSON.stringify(target)};`,
    'trackTemporaryPath(target);',
    `writeFileSync(target, '{}');`,
    body,
  ].join('\n');
  const scriptPath = path.join(root, 'scenario.mjs');
  writeFileSync(scriptPath, script);
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8', timeout: 20_000 });
  return { result, target };
}

describe('tracked temporary files', () => {
  it('removes tracked files when the process fails with an uncaught error', () => {
    const { result, target } = runScenario(`throw new Error('boom');`);
    expect(result.status).not.toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it('removes tracked files when the process is terminated by SIGTERM', () => {
    const { result, target } = runScenario(
      `process.kill(process.pid, 'SIGTERM'); setTimeout(() => {}, 10_000);`,
    );
    expect(result.status).toBe(143);
    expect(existsSync(target)).toBe(false);
  });

  it('removes tracked files when the process is interrupted by SIGINT', () => {
    const { result, target } = runScenario(
      `process.kill(process.pid, 'SIGINT'); setTimeout(() => {}, 10_000);`,
    );
    expect(result.status).toBe(130);
    expect(existsSync(target)).toBe(false);
  });

  it('keeps files that were untracked', () => {
    const { result, target } = runScenario('untrackTemporaryPath(target);');
    expect(result.status).toBe(0);
    expect(existsSync(target)).toBe(true);
  });
});
