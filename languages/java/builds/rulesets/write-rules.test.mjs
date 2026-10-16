import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GRADLE_DIRECTORY } from '../java-build.mjs';
import { scopedRuleset } from './pmd-rulesets.mjs';
import { main, writeRules } from './write-rules.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('write-rules', () => {
  it('writes the PMD rulesets of a plan file and lists them for the init script', () => {
    const reportDir = mkdtempSync(path.join(tmpdir(), 'nitpicker-write-rules-'));
    roots.push(reportDir);
    const plan = path.join(reportDir, 'pmd-plan.json');
    writeFileSync(
      plan,
      JSON.stringify({
        reportDir,
        mainDirectories: [],
        testDirectories: [],
        compiler: { release: null, source: '11', target: '11', encoding: null, args: [] },
        spring: false,
        nitpicker: true,
        project: null,
      }),
    );

    main(['pmd', plan]);

    expect(readFileSync(path.join(reportDir, 'pmd-rulesets.txt'), 'utf8').split(',')).toEqual([
      path.join(GRADLE_DIRECTORY, 'pmd-ruleset.xml'),
      path.join(reportDir, 'pmd-guards-main.xml'),
      path.join(reportDir, 'pmd-code-smells-main.xml'),
      path.join(reportDir, 'pmd-tests.xml'),
    ]);
    expect(readFileSync(path.join(reportDir, 'pmd-guards-main.xml'), 'utf8')).toBe(
      scopedRuleset(
        'nitpicker-guards-main',
        path.join(GRADLE_DIRECTORY, 'rules/guards-ruleset.xml'),
        {
          directories: [],
          skipped: ['InstanceofThenCast', 'CollectorsToList'],
        },
      ),
    );
  });

  it('rejects an unknown kind', () => {
    expect(() => {
      writeRules('spotbugs', {});
    }).toThrow(new Error('unknown rule configuration kind: spotbugs'));
  });
});
