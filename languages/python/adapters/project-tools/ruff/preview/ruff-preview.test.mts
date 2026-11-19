import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fieldOf, listOf, parseJson, textOf } from '../../../../../../shared/values/readers.mts';
import { mergePreviewReport } from './ruff-preview.mts';

const roots: string[] = [];
const encoding = { code: 'PLW1514', name: 'unspecified-encoding' };

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-ruff-preview-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function sarif(rules: readonly string[], results: readonly string[]): string {
  return JSON.stringify({
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'ruff', rules: rules.map((id) => ({ id })) } },
        results: results.map((ruleId) => ({ ruleId, message: { text: ruleId } })),
      },
    ],
  });
}

function ruleIds(file: string): { rules: string[]; results: string[] } {
  const run = listOf(fieldOf(parseJson(readFileSync(file, 'utf8')), 'runs'))[0];
  const rules = listOf(fieldOf(fieldOf(fieldOf(run, 'tool'), 'driver'), 'rules'));
  return {
    rules: rules.map((rule) => textOf(fieldOf(rule, 'id'))),
    results: listOf(fieldOf(run, 'results')).map((result) => textOf(fieldOf(result, 'ruleId'))),
  };
}

describe('mergePreviewReport', () => {
  it('adds only the preview rules and their results to the main report, by code', () => {
    const root = tempRoot();
    writeFileSync(path.join(root, 'ruff.sarif'), sarif(['F401'], ['F401']));
    writeFileSync(
      path.join(root, 'ruff-preview.sarif'),
      sarif(
        ['unspecified-encoding', 'unused-import'],
        ['unspecified-encoding', 'unused-import', 'PLW1514'],
      ),
    );

    mergePreviewReport(root, { mainReport: 'ruff.sarif', rules: [encoding] });

    expect(ruleIds(path.join(root, 'ruff.sarif'))).toEqual({
      rules: ['F401', 'PLW1514'],
      results: ['F401', 'PLW1514', 'PLW1514'],
    });
    expect(existsSync(path.join(root, 'ruff-preview.sarif'))).toBe(false);
  });

  it('leaves the main report alone when the preview pass wrote no report', () => {
    const root = tempRoot();
    const main = sarif(['F401'], ['F401']);
    writeFileSync(path.join(root, 'ruff.sarif'), main);

    mergePreviewReport(root, { mainReport: 'ruff.sarif', rules: [encoding] });

    expect(readFileSync(path.join(root, 'ruff.sarif'), 'utf8')).toBe(main);
  });
});
