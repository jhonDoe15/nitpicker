import { parseJsonc as untypedParseJsonc } from '../../../shared/jsonc/jsonc.mjs';
import { parseIni as untypedParseIni } from '../../../languages/python/adapters/configuration/ini-parser.mts';
import {
  blackConfigFiles as untypedBlackConfigFiles,
  ruffConfigFiles as untypedRuffConfigFiles,
} from '../../../languages/python/adapters/formatting/project-format-config.mts';
import { readProjectPyright as untypedReadProjectPyright } from '../../../languages/python/adapters/project-tools/pyright/pyright-project-config.mts';
import { readCoverageSettings as untypedReadCoverageSettings } from '../../../languages/python/adapters/configuration/coverage-config/python-coverage-config.mts';
import { readMypyConfig as untypedReadMypyConfig } from '../../../languages/python/adapters/configuration/mypy/mypy-config.mts';
import { readMutmutConfig as untypedReadMutmutConfig } from '../../../languages/python/adapters/project-tools/mutmut/mutmut-config.mts';
import { parseToml as untypedParseToml } from '../../../languages/python/adapters/project-tools/project-tool-layers.mts';

type IniSections = Map<string, Map<string, string>>;
export type RuntimeConfig = { readonly file?: string };

const parseJsonc: (text: string) => unknown = untypedParseJsonc;
const parseIni: (text: string) => IniSections = untypedParseIni;
const parseToml: (text: string) => unknown = untypedParseToml;
const ruffConfigFiles: (root: string) => string[] = untypedRuffConfigFiles;
const blackConfigFiles: (root: string) => string[] = untypedBlackConfigFiles;
const readProjectPyright: (
  root: string,
  checker: string,
  options: { readonly upward: true },
) => { readonly files?: readonly string[] } | undefined = untypedReadProjectPyright;
const readCoverageSettings: (root: string) => RuntimeConfig | undefined =
  untypedReadCoverageSettings;
const readMypyConfig: (root: string) => RuntimeConfig | undefined = untypedReadMypyConfig;
const readMutmutConfig: (root: string) => RuntimeConfig | undefined = untypedReadMutmutConfig;

export {
  blackConfigFiles,
  parseIni,
  parseJsonc,
  parseToml,
  readCoverageSettings,
  readMutmutConfig,
  readMypyConfig,
  readProjectPyright,
  ruffConfigFiles,
};
