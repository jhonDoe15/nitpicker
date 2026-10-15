import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeTypeScriptDiagnostics } from '../static-checks-runner.mjs';
import { loadTypeScript } from './typescript-program.mjs';

const ts = loadTypeScript();
const roots = [];

afterAll(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const SOURCE = [
  'type Env = Record<string, string | undefined>;',
  'export function port(env: Env): string | undefined { return env.PORT; }',
  'type Props = { title?: string };',
  'export function forward(title: string | undefined): Props { return { title }; }',
  '',
].join('\n');

function sha(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function findingsFor(source) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-compiler-hints-'));
  roots.push(root);
  const file = path.join(root, 'index.ts');
  writeFileSync(file, source);
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      exactOptionalPropertyTypes: true,
      noPropertyAccessFromIndexSignature: true,
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(({ file: of }) => of !== undefined);
  return normalizeTypeScriptDiagnostics({
    ts,
    diagnostics,
    projectRoot: root,
    analyzerName: 'typescript',
    configRelativePath: 'tsconfig.json',
  });
}

describe('compiler hints', () => {
  it('names the allowed form for the index-signature and exact-optional errors', () => {
    const findings = findingsFor(SOURCE);
    const byRule = new Map(findings.map((finding) => [finding.rule, finding.message]));

    expect(byRule.get('TS4111')).toContain('Read a key of an index signature with brackets');
    expect(byRule.get('TS2375')).toContain('`title?: string | undefined`');
  });

  it('keeps the finding identity of the compiler message', () => {
    for (const finding of findingsFor(SOURCE)) {
      const hintStart = finding.message.search(/ (?:Read a key|Declare the optional)/u);
      const original = hintStart === -1 ? finding.message : finding.message.slice(0, hintStart);

      expect(finding.identity).toContain(`message:${sha(original)}|`);
    }
  });
});
