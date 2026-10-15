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

const INDEX_SIGNATURE_ERROR =
  "Property 'PORT' comes from an index signature, so it must be accessed with ['PORT'].";
const INDEX_SIGNATURE_HINT =
  " Read a key of an index signature with brackets: `import.meta.env['VITE_API_URL']`, `styles['card']`, `process.env['PORT']`.";
const EXACT_OPTIONAL_ERROR = [
  "Type '{ title: string | undefined; }' is not assignable to type 'Props' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.",
  "  Types of property 'title' are incompatible.",
  "    Type 'string | undefined' is not assignable to type 'string'.",
  "      Type 'undefined' is not assignable to type 'string'.",
].join('\n');
const EXACT_OPTIONAL_HINT =
  ' Declare the optional field `title?: string | undefined` when a caller passes `undefined` through (as when forwarding a prop), or leave the key out when the value is missing.';

describe('compiler hints', () => {
  it('names the allowed form and keeps the identity of the compiler message', () => {
    const findings = findingsFor(SOURCE).map(({ rule, message, identity }) => ({
      rule,
      message,
      identity,
    }));

    expect(findings).toEqual([
      {
        rule: 'TS4111',
        message: `${INDEX_SIGNATURE_ERROR}${INDEX_SIGNATURE_HINT}`,
        identity: `diagnostic:4111|message:${sha(INDEX_SIGNATURE_ERROR)}|symbol:port|occurrence:1`,
      },
      {
        rule: 'TS2375',
        message: `${EXACT_OPTIONAL_ERROR}${EXACT_OPTIONAL_HINT}`,
        identity: `diagnostic:2375|message:${sha(EXACT_OPTIONAL_ERROR)}|symbol:forward|occurrence:1`,
      },
    ]);
  });
});
