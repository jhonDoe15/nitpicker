import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { normalizeTypeScriptDiagnostics } from '../static-checks-runner.mjs';
import { withAssetImportHint } from './asset-import-hint.mjs';

const ts = createRequire(import.meta.url)('typescript');
const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-typecheck-hint-'));

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

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

    const plain = "Cannot find module './panel.module.css' or its corresponding type declarations.";

    expect(finding.rule).toBe('TS2307');
    expect(finding.message).toBe(withAssetImportHint(2307, plain));
    expect(finding.message).not.toBe(plain);
    expect(finding.identity).toBe(`diagnostic:2307|message:${hash(plain)}|symbol:|occurrence:1`);
  });

  it('leave other type errors unchanged', () => {
    const [finding] = findingsFor('export const count: number = "one";\n');

    expect(finding.rule).toBe('TS2322');
    expect(finding.message).toBe("Type 'string' is not assignable to type 'number'.");
  });
});
