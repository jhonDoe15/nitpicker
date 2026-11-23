import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEngine } from '../../../../../shared/engine/engine-binary.mts';
import { engineFindingOf } from '../../../../../shared/engine/engine-rows.mts';
import { runEngineSync } from '../../../../../shared/engine/engine-run.mts';
import { useTempProjects } from '../../../../../shared/test-support/temp-projects.mts';
import { fieldOf, listOf, parseJson } from '../../../../../shared/values/readers.mts';
import { resolvedRulesets } from './pmd-catalog.mts';
import { engineRule, runsOnEngine } from './pmd-rule-parts.mts';

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, '../../../../..');
const MAIN_RULESET = path.join(REPOSITORY_ROOT, 'languages/java/gradle/pmd-main-ruleset.xml');
const RULE_NAME = 'SortedCollectionRangeScan';
const projectWith = useTempProjects('nitpicker-sorted-range-');

function engineBinary(): string | undefined {
  const found = findEngine(process.env);
  if (found !== undefined) {
    return found;
  }
  const binary = process.platform === 'win32' ? 'nitpicker-engine.exe' : 'nitpicker-engine';
  const debug = path.join(REPOSITORY_ROOT, 'engine', 'target', 'debug', binary);
  return existsSync(debug) ? debug : undefined;
}

function jdkHome(): string | undefined {
  const fromEnv = process.env['JAVA_HOME'];
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  const found = spawnSync('which', ['java'], { encoding: 'utf8' });
  if (found.status !== 0) {
    return undefined;
  }
  const javaPath = found.stdout.trim();
  if (javaPath === '') {
    return undefined;
  }
  return path.dirname(path.dirname(realpathSync(javaPath)));
}

function loadRule() {
  const reader = (reference: string): string =>
    reference === MAIN_RULESET
      ? readFileSync(MAIN_RULESET, 'utf8')
      : '<ruleset name="stub" xmlns="http://pmd.sourceforge.net/ruleset/2.0.0"/>';
  const ruleset = resolvedRulesets(reader)(MAIN_RULESET);
  const rule = ruleset.rules.find(({ name }) => name === RULE_NAME);
  if (rule === undefined) {
    throw new Error(`Rule ${RULE_NAME} not found in ${MAIN_RULESET}`);
  }
  return { ruleset, rule };
}

function runRuleOn(sources: Readonly<Record<string, string>>, exclude: readonly string[] = []) {
  const binary = engineBinary();
  const javaHome = jdkHome();
  if (binary === undefined || javaHome === undefined) {
    throw new Error('nitpicker-engine binary and JDK are required to run rule tests');
  }
  const root = projectWith(sources);
  const { ruleset, rule } = loadRule();
  const spec = { ...engineRule(rule, ruleset), exclude: [...exclude] };
  const rulesFile = path.join(root, 'rules.json');
  const reportFile = path.join(root, 'report.json');
  writeFileSync(rulesFile, JSON.stringify([spec]));
  const result = runEngineSync([path.join(root, 'src'), '--rules', '_XPath', '--out', reportFile], {
    binary,
    environment: {
      ...process.env,
      NP_XPATH_RULES: rulesFile,
      NITPICKER_JDK: javaHome,
    },
  });
  expect(result.status, result.stderr).toBe(0);
  const report = parseJson(readFileSync(reportFile, 'utf8'));
  return listOf(fieldOf(report, 'findings')).map((row) => {
    const finding = engineFindingOf(row);
    return {
      file: path.relative(root, finding.file),
      rule: finding.rule,
      line: finding.line,
    };
  });
}

const INVALID_SOURCE = [
  'package demo;',
  'import java.time.Instant;',
  'import java.util.ArrayList;',
  'import java.util.List;',
  'import java.util.Map;',
  'import java.util.NavigableMap;',
  'import java.util.NavigableSet;',
  'import java.util.SortedMap;',
  'import java.util.SortedSet;',
  'import java.util.TreeMap;',
  'import java.util.TreeSet;',
  'import java.util.concurrent.ConcurrentSkipListMap;',
  'import java.util.concurrent.ConcurrentSkipListSet;',
  'public final class BadScans {',
  '  public List<Integer> treeSetRange(TreeSet<Integer> set, int low, int high) {',
  '    List<Integer> out = new ArrayList<>();',
  '    for (int x : set) {',
  '      if (x < low) continue;',
  '      if (x > high) break;',
  '      out.add(x);',
  '    }',
  '    return out;',
  '  }',
  '  public int navigableSetCeiling(NavigableSet<Integer> set, int target) {',
  '    for (int x : set) {',
  '      if (x >= target) return x;',
  '    }',
  '    return -1;',
  '  }',
  '  public List<String> sortedSetCompareTo(SortedSet<String> set, String limit) {',
  '    List<String> out = new ArrayList<>();',
  '    for (String s : set) {',
  '      if (s.compareTo(limit) > 0) break;',
  '      out.add(s);',
  '    }',
  '    return out;',
  '  }',
  '  public int skipListSetBound(ConcurrentSkipListSet<Integer> set, int max) {',
  '    for (int x : set) {',
  '      if (x <= max) return x;',
  '    }',
  '    return -1;',
  '  }',
  '  public List<String> treeMapEntries(TreeMap<Integer, String> map, int low, int high) {',
  '    List<String> out = new ArrayList<>();',
  '    for (Map.Entry<Integer, String> e : map.entrySet()) {',
  '      if (e.getKey() < low) continue;',
  '      if (e.getKey() > high) break;',
  '      out.add(e.getValue());',
  '    }',
  '    return out;',
  '  }',
  '  public String navigableMapAlias(NavigableMap<Integer, String> map, int target) {',
  '    for (Map.Entry<Integer, String> e : map.entrySet()) {',
  '      int k = e.getKey();',
  '      if (k >= target) return e.getValue();',
  '    }',
  '    return null;',
  '  }',
  '  public List<String> sortedMapKeys(SortedMap<String, Integer> map, String from) {',
  '    List<String> out = new ArrayList<>();',
  '    for (String k : map.keySet()) {',
  '      if (k.compareTo(from) < 0) continue;',
  '      out.add(k);',
  '    }',
  '    return out;',
  '  }',
  '  public List<String> skipListMapInstant(ConcurrentSkipListMap<Instant, String> map, Instant start) {',
  '    List<String> out = new ArrayList<>();',
  '    for (Map.Entry<Instant, String> e : map.entrySet()) {',
  '      if (e.getKey().isBefore(start)) continue;',
  '      out.add(e.getValue());',
  '    }',
  '    return out;',
  '  }',
  '}',
  '',
].join('\n');

const VALID_SOURCE = [
  'package demo;',
  'import java.util.ArrayList;',
  'import java.util.HashMap;',
  'import java.util.HashSet;',
  'import java.util.List;',
  'import java.util.Map;',
  'import java.util.TreeMap;',
  'import java.util.TreeSet;',
  'import java.util.concurrent.ConcurrentSkipListSet;',
  'public final class GoodScans {',
  '  public List<Integer> rangeQuerySet(TreeSet<Integer> set, int low, int high, int cap) {',
  '    List<Integer> out = new ArrayList<>();',
  '    for (int x : set.subSet(low, true, high, true)) {',
  '      if (x > cap) break;',
  '      out.add(x);',
  '    }',
  '    return out;',
  '  }',
  '  public List<Integer> tailQuerySet(TreeSet<Integer> set, int low, int high) {',
  '    List<Integer> out = new ArrayList<>();',
  '    for (int x : set.tailSet(low)) {',
  '      if (x > high) break;',
  '      out.add(x);',
  '    }',
  '    return out;',
  '  }',
  '  public String rangeQueryMap(TreeMap<Integer, String> map, int low, int high, int target) {',
  '    for (Map.Entry<Integer, String> e : map.subMap(low, high).entrySet()) {',
  '      if (e.getKey() >= target) return e.getValue();',
  '    }',
  '    return null;',
  '  }',
  '  public List<Integer> headQueryMapKeys(TreeMap<Integer, String> map, int low, int high) {',
  '    List<Integer> out = new ArrayList<>();',
  '    for (int k : map.headMap(high).keySet()) {',
  '      if (k < low) continue;',
  '      out.add(k);',
  '    }',
  '    return out;',
  '  }',
  '  public int hashSetScan(HashSet<Integer> set, int target) {',
  '    for (int x : set) {',
  '      if (x >= target) return x;',
  '    }',
  '    return -1;',
  '  }',
  '  public int arrayListScan(ArrayList<Integer> list, int target) {',
  '    for (int x : list) {',
  '      if (x >= target) return x;',
  '    }',
  '    return -1;',
  '  }',
  '  public String hashMapScan(HashMap<Integer, String> map, int target) {',
  '    for (Map.Entry<Integer, String> e : map.entrySet()) {',
  '      if (e.getKey() >= target) return e.getValue();',
  '    }',
  '    return null;',
  '  }',
  '  public int noBoundCheck(TreeSet<Integer> set) {',
  '    int sum = 0;',
  '    for (int x : set) {',
  '      sum += x;',
  '    }',
  '    return sum;',
  '  }',
  '  public boolean equalityOnly(TreeSet<Integer> set, int target) {',
  '    for (int x : set) {',
  '      if (x == target) return true;',
  '    }',
  '    return false;',
  '  }',
  '  public int boundWithoutExit(TreeSet<Integer> set, int threshold) {',
  '    int count = 0;',
  '    for (int x : set) {',
  '      if (x > threshold) count++;',
  '    }',
  '    return count;',
  '  }',
  '  public void mutatingSet(ConcurrentSkipListSet<Integer> set, int cutoff) {',
  '    for (int x : set) {',
  '      if (x < cutoff) {',
  '        set.remove(x);',
  '        continue;',
  '      }',
  '    }',
  '  }',
  '  public void mutatingMapEntry(TreeMap<Integer, String> map, int max) {',
  '    for (Map.Entry<Integer, String> e : map.entrySet()) {',
  '      if (e.getKey() > max) break;',
  '      e.setValue("updated");',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

describe('SortedCollectionRangeScan', () => {
  it('is registered as an engine-runnable PMD XPath rule in pmd-main-ruleset.xml', () => {
    const { ruleset, rule } = loadRule();
    const spec = engineRule(rule, ruleset);

    expect(runsOnEngine(rule)).toBe(true);
    expect(spec.message).toContain('subSet');
    expect(spec.message).toContain('subMap');
  });

  it('flags linear bound-and-exit scans over sorted sets and maps', () => {
    const findings = runRuleOn({ 'src/main/java/demo/BadScans.java': INVALID_SOURCE });

    expect(findings).toEqual([
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 17 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 25 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 32 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 39 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 46 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 54 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 62 },
      { file: 'src/main/java/demo/BadScans.java', rule: RULE_NAME, line: 70 },
    ]);
  });

  it('allows range queries, non-sorted collections, mutating loops, non-bound loops, and test files', () => {
    const findings = runRuleOn(
      {
        'src/main/java/demo/GoodScans.java': VALID_SOURCE,
        'src/test/java/demo/BadScans.java': INVALID_SOURCE,
      },
      ['.*/src/test/.*'],
    );

    expect(findings).toEqual([]);
  });
});
