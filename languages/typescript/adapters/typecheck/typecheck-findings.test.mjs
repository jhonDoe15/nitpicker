import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeTypeScriptDiagnostics } from '../static-checks/typescript.mjs';
import { withAssetImportHint } from './asset-import-hint.mjs';

const ts = createRequire(import.meta.url)('typescript');
const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-typecheck-hint-'));
const sources = {
  'panel.ts': "import styles from './panel.module.css';\nexport { styles };\n",
  'count.ts': 'export const count: number = "one";\n',
};
const findings = { byFile: new Map() };

beforeAll(() => {
  for (const [file, text] of Object.entries(sources)) {
    writeFileSync(path.join(root, file), text);
  }
  const files = Object.keys(sources).map((file) => path.join(root, file));
  const program = ts.createProgram(files, { noEmit: true, noLib: true, types: [] });
  const normalized = normalizeTypeScriptDiagnostics({
    ts,
    diagnostics: files.flatMap((file) =>
      ts.getPreEmitDiagnostics(program, program.getSourceFile(file)),
    ),
    projectRoot: root,
    analyzerName: 'typescript-typecheck',
    configRelativePath: 'tsconfig.json',
  });
  for (const finding of normalized) {
    findings.byFile.set(finding.path, [...(findings.byFile.get(finding.path) ?? []), finding]);
  }
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function hash(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

describe('typecheck findings for missing modules', () => {
  it('add the asset import hint to the message and keep the identity of the plain message', () => {
    const [finding] = findings.byFile.get('panel.ts');
    const plain = "Cannot find module './panel.module.css' or its corresponding type declarations.";

    expect(finding.rule).toBe('TS2307');
    expect(finding.message).toBe(withAssetImportHint(2307, plain));
    expect(finding.message).not.toBe(plain);
    expect(finding.identity).toBe(`diagnostic:2307|message:${hash(plain)}|symbol:|occurrence:1`);
  });

  it('leave other type errors unchanged', () => {
    const [finding] = findings.byFile.get('count.ts');

    expect(finding.rule).toBe('TS2322');
    expect(finding.message).toBe("Type 'string' is not assignable to type 'number'.");
  });
});
