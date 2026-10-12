import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createJavaAnalyzer } from './java-analyzer.mjs';
import { applyJavaPolicy, configureJavaAnalyzer } from './java-policy.mjs';
import { parseRunnerArguments } from './java-runner.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function inventoryRoot(sites) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-java-policy-'));
  roots.push(root);
  writeFileSync(path.join(root, 'nitpicker.legacy.json'), JSON.stringify({ sites }));
  return root;
}

const finding = (file, identity = 'id') => ({
  tool: 'pmd',
  rule: 'Rule',
  path: file,
  identity,
  classification: 'enforceable',
});
const allow = (file, count, source = 'id') => ({ file, rule: 'Rule', source, count });

describe('configureJavaAnalyzer', () => {
  const context = {
    projectRoot: '/p',
    toolRoot: '/t',
    snapshot: 'head',
    projectPolicyRoot: tmpdir(),
    baselineRoot: tmpdir(),
  };

  it('leaves the analyzer untouched without any shared config', () => {
    const analyzer = createJavaAnalyzer();
    expect(configureJavaAnalyzer(analyzer, {})).toBe(analyzer);
  });

  it('hands thresholds, exclude, inventory and roots to the runner and changes the hash', () => {
    const analyzer = createJavaAnalyzer();
    const configured = configureJavaAnalyzer(analyzer, {
      thresholds: { crapLimit: 12 },
      exclude: ['a/**', 'b/*.java'],
      legacyInventory: 'legacy.json',
    });

    const { args } = configured.createInvocation(context);
    const parsed = parseRunnerArguments(args.slice(1));

    expect(parsed.projectRoot).toBe('/p');
    expect(parsed.policy).toMatchObject({
      crapLimit: 12,
      exclude: ['a/**', 'b/*.java'],
      legacyInventory: 'legacy.json',
      snapshot: 'head',
    });
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      configureJavaAnalyzer(analyzer, { thresholds: { crapLimit: 13 } }).configurationHash,
    ).not.toBe(configured.configurationHash);
    expect(configured.legacyInventory).toBe('legacy.json');
  });

  it('hands the Kotlin formatter and detekt config to the runner and changes the hash', () => {
    const analyzer = createJavaAnalyzer({ kotlin: true });
    const configured = configureJavaAnalyzer(analyzer, {
      kotlin: { formatter: 'ktfmt', detektConfig: 'tools/rules.yml' },
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context).args.slice(1));

    expect(parsed.policy).toEqual({
      crapLimit: undefined,
      exclude: [],
      legacyInventory: undefined,
      policyRoot: '/tmp',
      baselineRoot: '/tmp',
      snapshot: 'head',
      preset: 'kotlin',
      kotlinFormatter: 'ktfmt',
      kotlinDetektConfig: 'tools/rules.yml',
    });
    expect(configured.configurationHash).not.toBe(analyzer.configurationHash);
    expect(
      configureJavaAnalyzer(analyzer, { kotlin: { detektConfig: 'tools/rules.yml' } })
        .configurationHash,
    ).not.toBe(analyzer.configurationHash);
  });
});

describe('parseRunnerArguments', () => {
  it('rejects unknown options, missing values and a bad CRAP limit', () => {
    expect(() => parseRunnerArguments(['--project-root'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--nope', 'x'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--snapshot', 'head'])).toThrow(/Usage/);
    expect(() => parseRunnerArguments(['--project-root', '/p', '--crap-limit', '0'])).toThrow(
      /positive number/,
    );
  });

  it('defaults to the java preset and accepts the kotlin preset with a formatter', () => {
    expect(parseRunnerArguments(['--project-root', '/p']).policy).toEqual({
      crapLimit: undefined,
      exclude: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: 'java',
      kotlinFormatter: undefined,
      kotlinDetektConfig: undefined,
    });
    expect(
      parseRunnerArguments([
        '--project-root',
        '/p',
        '--preset',
        'kotlin',
        '--kotlin-formatter',
        'none',
        '--kotlin-detekt-config',
        'detekt.yaml',
      ]).policy,
    ).toEqual({
      crapLimit: undefined,
      exclude: [],
      legacyInventory: undefined,
      policyRoot: undefined,
      baselineRoot: undefined,
      snapshot: 'head',
      preset: 'kotlin',
      kotlinFormatter: 'none',
      kotlinDetektConfig: 'detekt.yaml',
    });
  });

  it('rejects an unknown preset or Kotlin formatter', () => {
    expect(() => parseRunnerArguments(['--project-root', '/p', '--preset', 'scala'])).toThrow(
      '--preset must be one of: java, kotlin',
    );
    expect(() =>
      parseRunnerArguments(['--project-root', '/p', '--kotlin-formatter', 'prettier']),
    ).toThrow('--kotlin-formatter must be one of: ktlint, ktfmt, none');
  });
});

describe('applyJavaPolicy', () => {
  it('drops findings under excluded globs only', () => {
    const findings = [finding('src/main/java/gen/A.java'), finding('src/main/java/app/B.java')];

    expect(applyJavaPolicy(findings, { exclude: ['src/main/java/gen/**'] })).toEqual([findings[1]]);
    expect(applyJavaPolicy(findings, {})).toEqual(findings);
  });

  it('baselines inventory sites on both snapshots, using the head inventory', () => {
    const headRoot = inventoryRoot([allow('a.java', 1)]);
    const findings = [finding('a.java'), finding('a.java'), finding('b.java')];

    expect(
      applyJavaPolicy(findings, {
        legacyInventory: 'nitpicker.legacy.json',
        policyRoot: headRoot,
        snapshot: 'base',
      }),
    ).toEqual([findings[1], findings[2]]);
  });

  it('reports baseline-expansion on head when the allowance rose over base', () => {
    const headRoot = inventoryRoot([allow('a.java', 3)]);
    const baseRoot = inventoryRoot([allow('a.java', 1)]);
    const options = {
      legacyInventory: 'nitpicker.legacy.json',
      policyRoot: headRoot,
      baselineRoot: baseRoot,
    };

    expect(applyJavaPolicy([], { ...options, snapshot: 'head' })).toEqual([
      expect.objectContaining({
        tool: 'java',
        rule: 'baseline-expansion',
        path: 'a.java',
        classification: 'enforceable',
      }),
    ]);
    expect(applyJavaPolicy([], { ...options, snapshot: 'base' })).toEqual([]);
    expect(
      applyJavaPolicy([], { ...options, snapshot: 'head', preset: 'kotlin' }).map(
        ({ tool, rule }) => [tool, rule],
      ),
    ).toEqual([['kotlin', 'baseline-expansion']]);
  });

  it('names the tool of a baseline-expansion after the language that asks', () => {
    const options = {
      legacyInventory: 'nitpicker.legacy.json',
      policyRoot: inventoryRoot([allow('a.py', 3)]),
      baselineRoot: inventoryRoot([allow('a.py', 1)]),
      snapshot: 'head',
    };

    expect(applyJavaPolicy([], { ...options, inventoryTool: 'python' })).toEqual([
      {
        tool: 'python',
        rule: 'baseline-expansion',
        path: 'a.py',
        identity: expect.any(String),
        message: 'Legacy allowance increased from 1 to 3 for Rule',
        classification: 'enforceable',
      },
    ]);
  });
});
