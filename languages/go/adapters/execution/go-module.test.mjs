import { describe, expect, it } from 'vitest';
import { parseGoMod } from './go-module.mjs';

describe('parseGoMod', () => {
  it('reads the module path, Go version, requirements and tool directives', () => {
    const text = [
      'module example.com/shop // the shop',
      '',
      'go 1.24.0',
      'toolchain go1.24.7',
      '',
      'require github.com/google/uuid v1.6.0',
      'require (',
      '\tgolang.org/x/sync v0.10.0 // indirect',
      '\tmvdan.cc/gofumpt v0.12.0',
      ')',
      '',
      'tool mvdan.cc/gofumpt',
      'tool (',
      '\tgolang.org/x/tools/cmd/goimports',
      ')',
    ].join('\n');
    expect(parseGoMod(text)).toEqual({
      module: 'example.com/shop',
      goVersion: '1.24.0',
      tools: ['mvdan.cc/gofumpt', 'golang.org/x/tools/cmd/goimports'],
      requires: ['github.com/google/uuid', 'golang.org/x/sync', 'mvdan.cc/gofumpt'],
    });
  });

  it('accepts a quoted module path and a file without tools', () => {
    expect(parseGoMod('module "example.com/q"\ngo 1.22\n')).toEqual({
      module: 'example.com/q',
      goVersion: '1.22',
      tools: [],
      requires: [],
    });
  });
});
