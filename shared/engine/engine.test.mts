import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCandidates, findEngine } from './engine-binary.mts';
import { engineFindings, readEngineLines, unparsedFiles } from './engine-rows.mts';
import { runEngine, runEngineSync } from './engine-run.mts';

const host = { platform: 'linux', arch: 'x64', root: '/package' };
const PACKAGED = '/package/engine/bin/linux-x64/nitpicker-engine';
const BUILT = '/package/engine/target/release/nitpicker-engine';

function hostWith(...present: string[]) {
  return { ...host, exists: (file: string) => present.includes(file) };
}

describe('finding the engine binary', () => {
  it('prefers the binary packaged for this platform over a local build', () => {
    expect(findEngine({}, hostWith(PACKAGED, BUILT))).toBe(PACKAGED);
    expect(findEngine({}, hostWith(BUILT))).toBe(BUILT);
  });

  it('reports none when no binary exists, so the caller runs the tool it replaces', () => {
    expect(findEngine({}, hostWith())).toBeUndefined();
  });

  it('takes the path the environment names, and nothing when the environment turns it off', () => {
    expect(findEngine({ NITPICKER_ENGINE: '/custom/engine' }, hostWith('/custom/engine'))).toBe(
      '/custom/engine',
    );
    expect(findEngine({ NITPICKER_ENGINE: '/custom/engine' }, hostWith(PACKAGED))).toBeUndefined();
    expect(findEngine({ NITPICKER_ENGINE: 'off' }, hostWith(PACKAGED))).toBeUndefined();
  });

  it('names the Windows binary with its extension', () => {
    const [packaged] = engineCandidates({ ...hostWith(), platform: 'win32', root: 'C:' });
    expect(packaged).toMatch(/win32-x64.nitpicker-engine\.exe$/u);
  });
});

describe('running the engine', () => {
  const node = process.execPath;

  it('returns status and both outputs without throwing on a failing run', async () => {
    const script = 'process.stdout.write("out"); process.stderr.write("why"); process.exit(3)';
    const expected = { status: 3, stdout: 'out', stderr: 'why' };
    expect(runEngineSync(['-e', script], { binary: node })).toEqual(expected);
    expect(await runEngine(['-e', script], { binary: node })).toEqual(expected);
  });

  it('reports a binary that cannot start as a run without status', async () => {
    const missing = path.join(tmpdir(), 'no-such-nitpicker-engine');
    expect(runEngineSync([], { binary: missing }).status).toBeNull();
    expect((await runEngine([], { binary: missing })).status).toBeNull();
  });
});

describe('reading what the engine wrote', () => {
  it('turns rows into findings and rejects anything else', () => {
    expect(engineFindings([['a.ts', 'nitpicker/x', 3, 5, 'why']])).toEqual([
      { file: 'a.ts', rule: 'nitpicker/x', line: 3, column: 5, message: 'why' },
    ]);
    expect(() => engineFindings([['a.ts', 'nitpicker/x', '3', 5, 'why']])).toThrow(TypeError);
    expect(() => engineFindings({})).toThrow(TypeError);
  });

  it('lists the files the engine could not parse', () => {
    const findings = engineFindings([
      ['a.ts', '!parse', 1, 1, ''],
      ['b.ts', 'nitpicker/x', 1, 1, 'why'],
    ]);
    expect([...unparsedFiles(findings)]).toEqual(['a.ts']);
  });

  it('reads a file of JSON lines one value at a time', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-engine-lines-'));
    const file = path.join(directory, 'facts.jsonl');
    writeFileSync(file, '{"file":"a.ts"}\n\n{"file":"b.ts"}\n');
    const values: unknown[] = [];
    for await (const value of readEngineLines(file)) {
      values.push(value);
    }
    rmSync(directory, { recursive: true });
    expect(values).toEqual([{ file: 'a.ts' }, { file: 'b.ts' }]);
  });
});
