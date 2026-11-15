import { describe, expect, it } from 'vitest';
import { cacheKey, createFindingsCache } from '../../diff/cache/findings-cache.mts';
import type { AnalyzerReport } from '../../../shared/values/findings.mts';
import type { ProfiledAnalyzer } from '../../../shared/values/analyzers.mts';
import { analyzerAt } from '../../configuration/test-support/analyzer-access.mts';
import { applyRunProfile } from '../profile.mts';
import { useGitFixtures } from '../../diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

function languageAnalyzer(name: string): ProfiledAnalyzer & { readonly version: string } {
  return {
    name,
    version: '1',
    configurationHash: 'h',
    createInvocation: () => ({ command: 'node', args: [], cwd: '.' }),
  };
}

function quickOf(analyzer: ProfiledAnalyzer): ProfiledAnalyzer {
  return analyzerAt(applyRunProfile([analyzer], { quick: true, analyzerNames: [] }).analyzers, 0);
}

const key = { mergeBaseSha: 'abc', projectRelativePath: '.' };
const report: AnalyzerReport = {
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
    const directory = temporaryRoot('nitpicker-quick-cache-');
    const cache = createFindingsCache({ store: undefined, directory, ...key });
    const full = languageAnalyzer('java');
    const quick = quickOf(full);

    cache.write(quick, report);
    expect(cache.read(full)).toBeUndefined();
    expect(cache.read(quick)?.findings).toEqual(report.findings);

    cache.write(full, { findings: [] });
    expect(cache.read(full)?.findings).toEqual([]);
    expect(cache.read(quick)?.findings).toEqual(report.findings);
  });

  it('reuses a full base entry for an analyzer whose quick output is identical', () => {
    const structure = languageAnalyzer('structure');

    expect(quickOf(structure)).toBe(structure);
    expect(cacheKey({ ...key, analyzer: quickOf(structure) })).toBe(
      cacheKey({ ...key, analyzer: structure }),
    );
  });
});
