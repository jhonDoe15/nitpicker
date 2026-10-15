import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeTypeScriptDiagnostics } from '../static-checks-runner.mjs';

const ts = createRequire(import.meta.url)('typescript');
const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-typecheck-hint-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function findingsFor(source) {
  const file = path.join(root, 'panel.ts');
  writeFileSync(file, source);
  const program = ts.createProgram([file], { noEmit: true, types: [] });
  return normalizeTypeScriptDiagnostics({
    diagnostics: ts.getPreEmitDiagnostics(program),
    projectRoot: root,
    analyzerName: 'typescript-typecheck',
    configRelativePath: 'tsconfig.json',
  });
}

describe('typecheck findings for missing modules', () => {
  it('name vite/client for a CSS Module import and keep the identity of the plain message', () => {
    const [finding] = findingsFor("import styles from './panel.module.css';\nexport { styles };\n");

    expect(finding.rule).toBe('TS2307');
    expect(finding.message).toContain("Cannot find module './panel.module.css'");
    expect(finding.message).toContain('`vite/client`');
    expect(finding.identity).toContain('diagnostic:2307');
  });

  it('leave other type errors unchanged', () => {
    const [finding] = findingsFor('export const count: number = "one";\n');

    expect(finding.rule).toBe('TS2322');
    expect(finding.message).not.toContain('vite/client');
  });
});
