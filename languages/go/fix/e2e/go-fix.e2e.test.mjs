import { describe, expect, it } from 'vitest';
import { fixReport, useFixProject } from '../../../../core/fix/test-support/fix-project.mjs';

const enabled = process.env.NITPICKER_GO_E2E === '1';
const { fix } = useFixProject();

const GO_MOD = 'module example.com/shop\n\ngo 1.24\n';
const source = (name) => `package shop\n\nfunc  ${name}() int {\n\n\treturn 1\n}\n`;
const GOFMT = (name) => `package shop\n\nfunc ${name}() int {\n\n\treturn 1\n}\n`;
const GOFUMPT = (name) => `package shop\n\nfunc ${name}() int {\n\treturn 1\n}\n`;
const EDITED_LEGACY = `${source('Legacy')}\nvar  limit = 2\n`;

function repository(formatters) {
  return {
    committed: {
      'nitpicker.config.json': JSON.stringify({ preset: 'go', go: { formatters } }),
      'go.mod': GO_MOD,
      'changed.go': GOFUMPT('Changed'),
      'untouched.go': source('Untouched'),
      'legacy.go': source('Legacy'),
    },
    changed: {
      'changed.go': source('Changed'),
      'cart/added.go': source('Added').replace('package shop', 'package cart'),
      'legacy.go': EDITED_LEGACY,
    },
  };
}

describe.skipIf(!enabled)('nitpicker --fix for Go', () => {
  it.each([
    { formatter: 'gofmt', expected: GOFMT },
    { formatter: 'gofumpt', expected: GOFUMPT },
  ])(
    'rewrites the changed files with $formatter and leaves an untouched or already unformatted file byte for byte',
    ({ formatter, expected }) => {
      const result = fix(repository([formatter]));

      expect(
        {
          exitCode: result.exitCode,
          report: fixReport(result.stdout),
          changed: result.read('changed.go'),
          added: result.read('cart/added.go'),
          untouched: result.read('untouched.go'),
          legacy: result.read('legacy.go'),
        },
        result.stdout + result.stderr,
      ).toEqual({
        exitCode: 0,
        report: `Fixed files:\ncart/added.go\nchanged.go\nFix notes:\n  ${formatter} rewrote cart/added.go, changed.go\n  ${formatter} left legacy.go as is: already unformatted before your change\n`,
        changed: expected('Changed'),
        added: expected('Added').replace('package shop', 'package cart'),
        untouched: source('Untouched'),
        legacy: EDITED_LEGACY,
      });
    },
  );
});
