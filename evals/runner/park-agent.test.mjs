import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const agent = path.join(import.meta.dirname, 'park-agent.mjs');
let directory;
beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-park-'));
});
afterAll(() => rmSync(directory, { recursive: true, force: true }));

const parked = (name) => path.join(directory, name);

function park(tier) {
  const child = spawn('node', [agent], {
    env: {
      ...process.env,
      NITPICKER_EVAL_PARK_DIR: directory,
      NITPICKER_EVAL_CASE: 'c1',
      NITPICKER_EVAL_TIER: tier,
      NITPICKER_EVAL_RUN: '1',
    },
  });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  return { child, exited };
}

async function until(condition) {
  for (let waited = 0; !condition() && waited < 5000; waited += 50) await sleep(50);
  return condition();
}

describe('park-agent', () => {
  it('ignores a stale done file and parks under a name that includes the tier', async () => {
    writeFileSync(parked('c1-sonnet-1.done'), '');
    const { child, exited } = park('sonnet');
    expect(await until(() => existsSync(parked('c1-sonnet-1.json')))).toBe(true);
    expect(existsSync(parked('c1-sonnet-1.done'))).toBe(false);
    const manifest = JSON.parse(readFileSync(parked('c1-sonnet-1.json'), 'utf8'));
    expect(manifest).toMatchObject({ case: 'c1', tier: 'sonnet' });
    expect(child.exitCode).toBe(null);
    writeFileSync(parked('c1-sonnet-1.done'), '');
    expect(await exited).toBe(0);
  });

  it('keeps two tiers of the same run apart', async () => {
    const first = park('opus');
    const second = park('haiku');
    expect(await until(() => existsSync(parked('c1-haiku-1.json')))).toBe(true);
    expect(await until(() => existsSync(parked('c1-opus-1.json')))).toBe(true);
    writeFileSync(parked('c1-opus-1.done'), '');
    expect(await first.exited).toBe(0);
    expect(second.child.exitCode).toBe(null);
    writeFileSync(parked('c1-haiku-1.done'), '');
    expect(await second.exited).toBe(0);
  });
});
