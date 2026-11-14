import { loadConfig, readDefault } from './layout-config-helpers.mts';
import { type ConfigEntry, type Policy, type Tsconfig, parseTsconfig } from './layout-views.mts';

export function readDefaultTsconfig(name: string): Tsconfig {
  return parseTsconfig(JSON.stringify(readDefault(name)));
}

export function selectFilesAndIgnores(module: { readonly default: readonly ConfigEntry[] }): {
  readonly files: ConfigEntry['files'];
  readonly ignores: ConfigEntry['ignores'];
}[] {
  return module.default.map(({ files, ignores }) => ({ files, ignores }));
}

export function loadDefaultConfig<Config>(
  relativePath: string,
  policy: Policy | undefined,
): Promise<Config> {
  return loadConfig(relativePath, policy, (module: { readonly default: Config }) => module.default);
}
