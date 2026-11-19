import { parseXml } from '../../../../../shared/values/xml.mts';
import type { XmlElement } from '../../../../../shared/values/xml.mts';
import { messageOf } from '../../../../../shared/values/readers.mts';

export function parsedXml(text: string): { root?: XmlElement; failure?: string | undefined } {
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}
