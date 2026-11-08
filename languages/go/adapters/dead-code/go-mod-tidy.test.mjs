import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { tidyFindings } from './go-mod-tidy.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-tidy-'));
writeFileSync(
  path.join(root, 'go.mod'),
  [
    'module shop',
    '',
    'go 1.24',
    '',
    'require (',
    '\tgithub.com/old/thing v1.2.0',
    '\tgolang.org/x/sync v0.10.0 // indirect',
    '\tgolang.org/x/text v0.20.0 // indirect',
    '\tgithub.com/pinned/lib v1.0.0 // pinned for CVE-1',
    ')',
    '',
    'exclude (',
    '\tgithub.com/bad/release v0.9.0',
    ')',
    '',
  ].join('\n'),
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const DIFF = [
  'diff current/go.mod tidy/go.mod',
  '--- current/go.mod',
  '+++ tidy/go.mod',
  '@@ -1,9 +1,9 @@',
  ' module shop',
  ' ',
  '-go 1.24',
  '+go 1.25.0',
  ' ',
  ' require (',
  '-\tgithub.com/old/thing v1.2.0',
  '-\tgolang.org/x/sync v0.10.0 // indirect',
  '+\tgithub.com/new/client v0.3.1',
  '+\tgolang.org/x/sync v0.10.0',
  '+\tgolang.org/x/net v0.30.0 // indirect',
  ' \tgolang.org/x/text v0.20.0 // indirect',
  '-\tgithub.com/pinned/lib v1.0.0 // pinned for CVE-1',
  ' )',
  ' ',
  ' exclude (',
  '-\tgithub.com/bad/release v0.9.0',
  ' )',
  '',
  'diff current/go.sum tidy/go.sum',
  '--- current/go.sum',
  '+++ tidy/go.sum',
  '@@ -0,0 +1 @@',
  '+github.com/new/client v0.3.1 h1:abc=',
  '',
].join('\n');

describe('go mod tidy findings', () => {
  it('reports requirements tidy removes and direct ones it adds, not markers, excludes or go.sum', () => {
    expect(tidyFindings(root, DIFF)).toEqual([
      {
        tool: 'dependencies',
        rule: 'unused-dependency',
        path: 'go.mod',
        identity: 'unused-dependency:github.com/old/thing',
        message:
          'go.mod requires github.com/old/thing, but no package of the module needs it. Run `go mod tidy`.',
        classification: 'enforceable',
        location: { line: 6 },
      },
      {
        tool: 'dependencies',
        rule: 'unused-dependency',
        path: 'go.mod',
        identity: 'unused-dependency:github.com/pinned/lib',
        message:
          'go.mod requires github.com/pinned/lib, but no package of the module needs it. Run `go mod tidy`.',
        classification: 'enforceable',
        location: { line: 9 },
      },
      {
        tool: 'dependencies',
        rule: 'unlisted-dependency',
        path: 'go.mod',
        identity: 'unlisted-dependency:github.com/new/client',
        message:
          'The code imports a package of github.com/new/client, which go.mod does not require. Run `go mod tidy`.',
        classification: 'enforceable',
      },
    ]);
  });

  it('reports nothing for a tidy module', () => {
    expect(tidyFindings(root, '')).toEqual([]);
  });
});
