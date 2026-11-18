import { parseIni as untypedParseIni } from '../../../adapters/configuration/pytest/ini-file.mts';
import type { IniSections } from '../../../adapters/configuration/ini-parser.mts';

export const parseIni: (text: string) => IniSections = untypedParseIni;
