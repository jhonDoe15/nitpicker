import type { Linter } from 'eslint';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, vi } from 'vitest';
import { checkoutModulePath as untypedCheckoutModulePath } from '../../../../shared/paths/checkout-module.mjs';
import { fieldOf, listOf, objectOf } from '../../../../shared/values/readers.mts';
import { linterConfigs } from '../eslint-config/typed/config-types.mts';

const checkoutModulePath: (file: string) => string = untypedCheckoutModulePath;

const presetConfigUrl = pathToFileURL(
  checkoutModulePath(path.join(import.meta.dirname, '../defaults/eslint.config.mjs')),
);

type Import = { readonly root: string; readonly policy?: object | undefined };

export function usePresetConfig(label: string): {
  readonly importConfig: (options: Import) => Promise<unknown>;
  readonly linterConfigFor: (options: Import) => Promise<Linter.Config[]>;
} {
  let importCount = 0;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function importConfig({ root, policy }: Import): Promise<unknown> {
    if (policy !== undefined) {
      const policyFile = path.join(root, 'policy.json');
      await writeFile(policyFile, JSON.stringify(policy));
      vi.stubEnv('NITPICKER_POLICY', policyFile);
    }
    importCount += 1;
    const module: unknown = await import(`${presetConfigUrl.href}?${label}=${String(importCount)}`);
    return fieldOf(module, 'default');
  }

  async function linterConfigFor(options: Import): Promise<Linter.Config[]> {
    vi.stubEnv('NITPICKER_DIFF_ESLINT_PROJECT_ROOT', options.root);
    return linterConfigs(
      listOf(await importConfig(options)).flatMap((entry) => objectOf(entry) ?? []),
    );
  }

  return { importConfig, linterConfigFor };
}
