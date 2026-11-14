import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { formatFindings } from './go-format.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function contextWith({ config, precedence, from }) {
  const policyRoot = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-format-message-'));
  roots.push(policyRoot);
  writeFileSync(path.join(policyRoot, '.golangci.yml'), config);
  return { policyRoot, toolPrecedence: { gofumpt: precedence }, formatting: { from } };
}

const GOFUMPT_EXTRA =
  'version: "2"\nformatters:\n  settings:\n    gofumpt:\n      extra-rules: true\n';

describe('formatFindings', () => {
  it('names the exact command with the options the check used', () => {
    const context = contextWith({
      config: GOFUMPT_EXTRA,
      precedence: ['project'],
      from: '.golangci.yml',
    });

    expect(formatFindings(context, { formatter: 'gofumpt', files: ['shop/cart.go'] })).toEqual([
      {
        tool: 'gofumpt',
        rule: 'format',
        path: 'shop/cart.go',
        identity: 'format',
        message:
          "File is not formatted with gofumpt (the project's formatter, from .golangci.yml). " +
          'Run `nitpicker --fix`, or format the file with `gofumpt -extra -w <file>`.',
        classification: 'enforceable',
      },
    ]);
  });

  it('leaves out the project options when the project config does not win', () => {
    const context = contextWith({ config: GOFUMPT_EXTRA, precedence: ['nitpicker'] });

    expect(formatFindings(context, { formatter: 'gofumpt', files: ['a.go'] })[0].message).toBe(
      'File is not formatted with gofumpt. Run `nitpicker --fix`, or format the file with `gofumpt -w <file>`.',
    );
  });
});
