import { escapeXml as untypedEscapeXml } from '../../adapters/tool-config/xml-write.mts';

export const escapeXml: (text: string) => string = untypedEscapeXml;
