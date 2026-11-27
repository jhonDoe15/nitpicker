import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { fieldOf, listOf } from '../../../../../../shared/values/readers.mts';
import { nativeConfigFlags } from '../../../lint-engine/compatibility/native-config.mts';
import { configKeyOf } from './config-key.mts';

type ConfigOf = (file: string) => Promise<unknown>;

function isFlatEntry(entry: unknown): entry is Linter.Config {
  return typeof entry === 'object' && entry !== null && !Array.isArray(entry);
}

function relativeTo(root: string, file: string) {
  return path.relative(root, path.resolve(root, file)).replaceAll(path.sep, '/');
}

export async function configResolver(root: string, configPath: string): Promise<ConfigOf> {
  const loaded: unknown = await import(pathToFileURL(configPath).href);
  const entries = listOf(fieldOf(loaded, 'default'));
  const keyOf = configKeyOf(entries);
  const flat = entries.filter(isFlatEntry);
  const perFile = keyOf === undefined || flat.length !== entries.length;
  const eslint = new ESLint({
    cwd: root,
    flags: nativeConfigFlags(configPath),
    ...(perFile
      ? { overrideConfigFile: configPath }
      : { overrideConfigFile: true, overrideConfig: flat }),
  });
  async function calculated(file: string): Promise<unknown> {
    const config: unknown = await eslint.calculateConfigForFile(file);
    return config;
  }
  if (perFile) {
    return calculated;
  }
  const known = new Map<string, Promise<unknown>>();
  return async (file) => {
    const key = keyOf(relativeTo(root, file));
    if (key === undefined) {
      return undefined;
    }
    const config = known.get(key) ?? calculated(file);
    known.set(key, config);
    return config;
  };
}
