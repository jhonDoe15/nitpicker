import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyFindingPolicy } from './finding-policy.mjs';
import { evaluateDuplicates } from './rules/duplicates.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function inventoryRoot(sites) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-finding-policy-'));
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

describe('applyFindingPolicy', () => {
  it('drops findings under excluded globs only', () => {
    const findings = [finding('src/main/java/gen/A.java'), finding('src/main/java/app/B.java')];

    expect(applyFindingPolicy(findings, { exclude: ['src/main/java/gen/**'] })).toEqual([
      findings[1],
    ]);
    expect(applyFindingPolicy(findings, {})).toEqual(findings);
  });

  it('drops only the findings of the excepted rule under the excepted globs', () => {
    const at = (file, rule) => ({ ...finding(file), rule });
    const findings = [
      at('src/Main.kt', 'detekt.style.ForbiddenMethodCall'),
      at('src/Other.kt', 'detekt.style.ForbiddenMethodCall'),
      at('src/Main.kt', 'detekt.style.UseDataClass'),
    ];

    expect(
      applyFindingPolicy(findings, {
        exceptions: [{ rule: 'detekt.style.ForbiddenMethodCall', glob: 'src/Main.kt' }],
      }),
    ).toEqual([findings[1], findings[2]]);
  });

  it('baselines inventory sites on both snapshots, using the head inventory', () => {
    const headRoot = inventoryRoot([allow('a.java', 1)]);
    const findings = [finding('a.java'), finding('a.java'), finding('b.java')];

    expect(
      applyFindingPolicy(findings, {
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

    expect(applyFindingPolicy([], { ...options, snapshot: 'head' })).toEqual([
      expect.objectContaining({
        tool: 'java',
        rule: 'baseline-expansion',
        path: 'a.java',
        classification: 'enforceable',
      }),
    ]);
    expect(applyFindingPolicy([], { ...options, snapshot: 'base' })).toEqual([]);
    expect(
      applyFindingPolicy([], { ...options, snapshot: 'head', preset: 'kotlin' }).map(
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

    expect(applyFindingPolicy([], { ...options, inventoryTool: 'python' })).toEqual([
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

describe('applyFindingPolicy on a finding about two files', () => {
  const [clone, ...sizes] = evaluateDuplicates(
    [
      {
        first: { file: 'src/a/Left.java', line: 3 },
        second: { file: 'src/b/Right.java', line: 8 },
        fragment: 'x',
        lines: 6,
        tokens: 60,
      },
    ],
    'duplicates',
  );
  const all = [clone, ...sizes];

  it('drops the finding and its size metrics when an excluded glob matches either file', () => {
    expect(applyFindingPolicy(all, { exclude: ['src/a/**'] })).toEqual([]);
    expect(applyFindingPolicy(all, { exclude: ['src/b/**'] })).toEqual([]);
    expect(applyFindingPolicy(all, { exclude: ['src/c/**'] })).toEqual(all);
  });

  it('lifts the rule when an exception glob matches either file', () => {
    const lift = (glob) =>
      applyFindingPolicy(all, { exceptions: [{ rule: 'duplicate-clone', glob }] });

    expect(lift('src/a/**')).toEqual(sizes);
    expect(lift('src/b/**')).toEqual(sizes);
    expect(lift('src/c/**')).toEqual(all);
  });
});
