import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildFlags, vetFindings } from './go-vet.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-go-vet-'));
mkdirSync(path.join(root, 'shop'));
writeFileSync(
  path.join(root, 'shop/price.go'),
  'package shop\n\nimport "fmt"\n\nfunc Show(n int) string {\n\treturn fmt.Sprintf("%s", n)\n}\n\nfunc Again(n int) string {\n\treturn fmt.Sprintf("%s", n)\n}\n',
);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const diagnostic = (line) => `{
\t"example.com/shop": {
\t\t"printf": [
\t\t\t{
\t\t\t\t"posn": "${root}/shop/price.go:${String(line)}:9",
\t\t\t\t"message": "fmt.Sprintf format %s has arg n of wrong type int"
\t\t\t}
\t\t]
\t}
}`;

describe('vetFindings', () => {
  it('reads analyzer diagnostics and compile errors, keyed by message and source line', () => {
    const text = [
      '# example.com/shop/broken',
      'vet: broken/b.go:4:9: undefined: missing',
      '# example.com/shop',
      diagnostic(6),
      '# [example.com/shop]',
      diagnostic(10),
      diagnostic(10),
    ].join('\n');
    const findings = vetFindings(root, text);
    expect(
      findings.map(({ tool, rule, path: file, location }) => [tool, rule, file, location.line]),
    ).toEqual([
      ['build', 'compile-error', 'broken/b.go', 4],
      ['vet', 'printf', 'shop/price.go', 6],
      ['vet', 'printf', 'shop/price.go', 10],
    ]);
    const identities = findings.map(({ identity }) => identity.split(':'));
    expect(identities.map(([, ...occurrence]) => occurrence.join(':'))).toEqual([
      'occurrence:1',
      'occurrence:1',
      'occurrence:2',
    ]);
    expect(identities[1][0]).toBe(identities[2][0]);
    expect(findings[0].message).toBe(
      'undefined: missing. The code does not compile; fix it before anything else is checked.',
    );
  });

  it('ignores positions outside the project', () => {
    expect(vetFindings(root, 'vet: /elsewhere/x.go:1:1: broken')).toEqual([]);
  });

  it('passes build tags to every go command', () => {
    expect(buildFlags({ buildTags: ['integration', 'linux'] })).toEqual([
      '-tags=integration,linux',
    ]);
    expect(buildFlags({})).toEqual([]);
  });
});
