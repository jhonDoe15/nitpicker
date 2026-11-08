import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { describePolicyChanges } from '../../policy-changes/describe-policy-changes.mjs';
import { createPolicyScope, rootSets } from '../../policy-changes/policy-scope.mjs';
import { describeConfigOverrides, readConfigFile } from '../config.mjs';
import { validateConfig } from '../validate.mjs';

const SCHEMA_LINE = './node_modules/nitpicker/spec/config.schema.json';
const folders = [];

function projectWith(config) {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'nitpicker-schema-key-'));
  folders.push(folder);
  writeFileSync(path.join(folder, 'nitpicker.config.json'), JSON.stringify(config));
  return folder;
}

afterEach(() => {
  for (const folder of folders.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

describe('the $schema line of nitpicker.config.json', () => {
  it('is accepted by the validator as a string and refused as anything else', () => {
    expect(validateConfig({ $schema: SCHEMA_LINE, preset: 'java' })).toEqual({
      $schema: SCHEMA_LINE,
      preset: 'java',
    });
    expect(() => validateConfig({ $schema: 3 })).toThrow('"$schema" must be a string');
  });

  it('names itself among the allowed keys when another key is unknown', () => {
    expect(() => validateConfig({ schema: SCHEMA_LINE })).toThrow(
      /unknown key "schema"\. Allowed keys: \$schema, base, preset/u,
    );
  });

  it('is dropped when the file is read, so no later step sees it', () => {
    const config = readConfigFile(projectWith({ $schema: SCHEMA_LINE, preset: 'python' }));

    expect(config).toEqual({ preset: 'python' });
    expect(describeConfigOverrides(config)).toEqual(['preset: "python"']);
  });

  it('is not a policy change when a change adds it', () => {
    const base = readConfigFile(projectWith({ preset: 'typescript' }));
    const head = readConfigFile(projectWith({ $schema: SCHEMA_LINE, preset: 'typescript' }));
    const scope = createPolicyScope({
      files: ['src/a.ts'],
      baseFiles: ['src/a.ts'],
      baseRoots: rootSets(base, '.'),
      headRoots: rootSets(head, '.'),
      headConfig: head,
    });

    expect(describePolicyChanges(base, head, scope)).toEqual({ loosened: [], changed: [] });
  });
});
