import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cacheKey, createFindingsCache } from '../../diff/cache/findings-cache.mjs';
import { applyRunProfile } from '../profile.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function languageAnalyzer(name) {
  return {
    name,
    version: '1',
    configurationHash: 'h',
    createInvocation: () => ({ command: 'node', args: [], cwd: '.' }),
  };
}

function quickOf(analyzer) {
  return applyRunProfile([analyzer], { quick: true, analyzerNames: [] }).analyzers[0];
}

const key = { mergeBaseSha: 'abc', projectRelativePath: '.' };
const report = {
  findings: [
    {
      tool: 'java',
      rule: 'r',
      path: 'x.java',
      identity: 'i',
      message: 'm',
      classification: 'enforceable',
    },
  ],
};

describe('quick mode in the findings cache key', () => {
  it.each(['python', 'java', 'kotlin'])('keeps a quick %s base apart from a full one', (name) => {
    const full = languageAnalyzer(name);
    const quick = quickOf(full);

    expect(cacheKey({ ...key, analyzer: quick })).not.toBe(cacheKey({ ...key, analyzer: full }));
    expect(cacheKey({ ...key, analyzer: { ...full, quick: true } })).not.toBe(
      cacheKey({ ...key, analyzer: full }),
    );
  });

  it('never serves a quick entry to a full run or a full entry to a quick run', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'nitpicker-quick-cache-'));
    temporaryRoots.push(directory);
    const cache = createFindingsCache({ directory, ...key });
    const full = languageAnalyzer('java');
    const quick = quickOf(full);

    cache.write(quick, report);
    expect(cache.read(full)).toBeUndefined();
    expect(cache.read(quick).findings).toEqual(report.findings);

    cache.write(full, { findings: [] });
    expect(cache.read(full).findings).toEqual([]);
    expect(cache.read(quick).findings).toEqual(report.findings);
  });

  it('reuses a full base entry for an analyzer whose quick output is identical', () => {
    const structure = languageAnalyzer('structure');

    expect(quickOf(structure)).toBe(structure);
    expect(cacheKey({ ...key, analyzer: quickOf(structure) })).toBe(
      cacheKey({ ...key, analyzer: structure }),
    );
  });
});
