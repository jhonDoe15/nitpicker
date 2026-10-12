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

const context = () => ({
  projectRoot: '/p',
  toolRoot: '/t',
  snapshot: 'head',
  projectPolicyRoot: tmpdir(),
  baselineRoot: tmpdir(),
});

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
});

describe('Java file limits', () => {
  it('hands file-limit thresholds and their exceptions to the runner, leaving ESLint rules out', () => {
    const exception = {
      rule: 'folder-files-limit',
      paths: ['src/main/java/icons/**'],
      reason: 'x',
    };
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12, fileLines: 400, folderFiles: 12 },
      exceptions: [exception, { rule: 'nitpicker/no-throw', paths: ['**'], reason: 'y' }],
    });

    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));

    expect(parsed.policy.fileLimits).toEqual({
      thresholds: { fileLines: 400, folderFiles: 12 },
      exceptions: [exception],
    });
  });

  it('passes no file limits when the config sets none', () => {
    const configured = configureJavaAnalyzer(createJavaAnalyzer(), {
      thresholds: { crapLimit: 12 },
    });
    const parsed = parseRunnerArguments(configured.createInvocation(context()).args.slice(1));
    expect(parsed.policy.fileLimits).toBeUndefined();
  });

  it('rejects file limits that are not a JSON object', () => {
    expect(() => parseRunnerArguments(['--project-root', '/p', '--file-limits', '[]'])).toThrow(
      '--file-limits must be a JSON object',
    );
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
  });
});
