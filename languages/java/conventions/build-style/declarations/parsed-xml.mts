import { parseXml, type XmlElement } from '../../../../../shared/ingest/report-records.mts';
import { messageOf } from '../../../../../shared/values/readers.mts';

export function parsedXml(text: string): { root?: XmlElement; failure?: string | undefined } {
  try {
    return { root: parseXml(text) };
  } catch (error) {
    return { failure: messageOf(error) };
  }
}
