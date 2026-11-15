import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { testOptions } from '../../../test-runners/typed/test-options.mts';
import { writeFileTree } from '../../../test-support/file-tree.mts';
import type { QualityAreaOptions } from '../../typed/area-types.mts';

const TYPESCRIPT_CONFIG = 'languages/typescript/preset/defaults/tsconfig.quality.json';

export function createAnalyzerRunnerProject({
  name,
  analyzer,
  analyzerFunction,
  extraFiles = {},
}: {
  readonly name: string;
  readonly analyzer: string;
  readonly analyzerFunction: string;
  readonly extraFiles?: Readonly<Record<string, string>>;
}): { readonly directory: string; readonly options: QualityAreaOptions } {
  const directory = mkdtempSync(path.join(tmpdir(), `nitpicker-${name}-runner-`));
  writeFileTree(directory, {
    'policy.json': JSON.stringify({ exclude: [], layout: {}, exceptions: [], thresholds: {} }),
    [`policy/${TYPESCRIPT_CONFIG}`]: '{}',
    [`policy/${analyzer}`]: `export function ${analyzerFunction}() { throw new Error('no program'); }\n`,
    'project/package.json': '{"name":"app","private":true}',
    ...extraFiles,
  });
  vi.stubEnv('NITPICKER_POLICY', path.join(directory, 'policy.json'));
  const options = testOptions({
    projectRoot: path.join(directory, 'project'),
    policyRoot: path.join(directory, 'policy'),
    analyzerName: 'structure',
  });
  return { directory, options };
}

export function removeAnalyzerRunnerProject(directory: string): void {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
}
