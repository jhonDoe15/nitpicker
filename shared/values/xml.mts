import { childrenNamed as namedChildren, parseXml as parsed } from '../ingest/common.mjs';

export type XmlElement = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string | undefined>>;
  readonly children: readonly XmlElement[];
  readonly text?: string;
};

export const parseXml: (text: string) => XmlElement = parsed;
export const childrenNamed: (element: XmlElement, name: string) => XmlElement[] = namedChildren;
