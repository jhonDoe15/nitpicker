import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectFormatters, formatterOptions, golangciConfigFiles } from './go-formatters.mjs';

const roots = [];

function project(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-format-'));
  roots.push(root);
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(path.join(root, name), text);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('detectFormatters', () => {
  it('runs gofmt, which every Go project follows, when nothing names a formatter', () => {
    expect(detectFormatters(project({ 'go.mod': 'module m\n' }))).toEqual({
      formatters: ['gofmt'],
      from: undefined,
    });
  });

  it('follows the tool directives in go.mod', () => {
    const root = project({
      'go.mod': 'module m\n\ntool (\n\tmvdan.cc/gofumpt\n\tgolang.org/x/tools/cmd/goimports\n)\n',
    });
    expect(detectFormatters(root)).toEqual({
      formatters: ['gofumpt', 'goimports'],
      from: 'the tool directives in go.mod',
    });
  });

  it('follows the formatters of a golangci-lint v2 or v1 config', () => {
    const v2 = project({
      'go.mod': 'module m\n',
      '.golangci.yml': 'version: "2"\nformatters:\n  enable: [gofmt, goimports]\n',
    });
    expect(detectFormatters(v2)).toEqual({ formatters: ['goimports'], from: '.golangci.yml' });
    const v1 = project({
      'go.mod': 'module m\n',
      '.golangci.toml': '[linters]\nenable = ["gofumpt", "errcheck"]\n',
    });
    expect(detectFormatters(v1)).toEqual({ formatters: ['gofumpt'], from: '.golangci.toml' });
  });

  it('lets "go.formatters" win over what the project says', () => {
    const root = project({ 'go.mod': 'module m\n\ntool mvdan.cc/gofumpt\n' });
    expect(detectFormatters(root, ['gofmt'])).toEqual({
      formatters: ['gofmt'],
      from: '"go.formatters"',
    });
  });
});

describe('formatterOptions', () => {
  const config = [
    'version: "2"',
    'formatters:',
    '  settings:',
    '    goimports:',
    '      local-prefixes: [example.com/shop]',
    '    gofumpt:',
    '      extra-rules: true',
  ].join('\n');

  it('reads the golangci-lint formatter settings only when the project opts in', () => {
    const root = project({ '.golangci.yaml': config });
    expect(formatterOptions(root, 'goimports')).toEqual([]);
    expect(formatterOptions(root, 'goimports', ['project', 'nitpicker'])).toEqual([
      '-local',
      'example.com/shop',
    ]);
    expect(formatterOptions(root, 'gofumpt', ['project'])).toEqual(['-extra']);
    expect(golangciConfigFiles(root, {})).toEqual([]);
    expect(golangciConfigFiles(root, { gofumpt: { precedence: ['project'] } })).toContain(
      path.join(root, '.golangci.yaml'),
    );
  });

  it('reads a v1 comma-separated prefix list', () => {
    const root = project({
      '.golangci.yml': 'linters-settings:\n  goimports:\n    local-prefixes: a.com/x,b.com/y\n',
    });
    expect(formatterOptions(root, 'goimports', ['project'])).toEqual(['-local', 'a.com/x,b.com/y']);
  });
});
