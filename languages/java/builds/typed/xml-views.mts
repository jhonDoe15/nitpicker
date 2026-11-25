import { escapeXml as untypedEscapeXml } from '../../../../shared/xml/xml-write.mts';

export const escapeXml: (text: string) => string = untypedEscapeXml;
