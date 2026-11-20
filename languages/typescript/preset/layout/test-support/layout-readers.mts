import { fieldOf, fieldsOf, textsOf } from '../../../../../shared/values/readers.mts';
import type { JscpdConfig, KnipConfig } from '../../typed/tool-config/tool-config-types.mts';
import { readDefault } from './layout-config-loading.mts';
import { type ConfigEntry, type Tsconfig, parseTsconfig } from './layout-views.mts';

export function readDefaultKnip(name: string): KnipConfig {
  const config = readDefault(name);
  return {
    ...fieldsOf(config),
    entry: textsOf(fieldOf(config, 'entry')),
    project: textsOf(fieldOf(config, 'project')),
    ignore: textsOf(fieldOf(config, 'ignore')),
  };
}

export function readDefaultJscpd(name: string): JscpdConfig {
  const config = readDefault(name);
  return {
    ...fieldsOf(config),
    format: textsOf(fieldOf(config, 'format')),
    path: textsOf(fieldOf(config, 'path')),
    ignore: textsOf(fieldOf(config, 'ignore')),
  };
}

export function readDefaultTsconfig(name: string): Tsconfig {
  return parseTsconfig(JSON.stringify(readDefault(name)));
}

function isEntryList(value: unknown): value is readonly ConfigEntry[] {
  return Array.isArray(value);
}

export function defaultEntries(module: object): readonly ConfigEntry[] {
  const entries: unknown = Reflect.get(module, 'default');
  if (!isEntryList(entries)) {
    throw new TypeError('The config does not export a list of entries');
  }
  return entries;
}

export function selectFilesAndIgnores(module: object): {
  readonly files: ConfigEntry['files'];
  readonly ignores: ConfigEntry['ignores'];
}[] {
  return defaultEntries(module).map(({ files, ignores }) => ({ files, ignores }));
}
