import {
  childAt as childAtPath,
  childrenAt as childrenAtPath,
  childrenNamed as namedChildren,
  parseXml as parsed,
} from '../ingest/common.mjs';

export type XmlElement = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string | undefined>>;
  readonly children: readonly XmlElement[];
  readonly text?: string;
};

export const parseXml: (text: string) => XmlElement = parsed;
export const childrenNamed: (element: XmlElement, name: string) => XmlElement[] = namedChildren;
export const childAt: (
  element: XmlElement | undefined,
  ...names: readonly string[]
) => XmlElement | undefined = childAtPath;
export const childrenAt: (
  element: XmlElement | undefined,
  ...names: readonly string[]
) => XmlElement[] = childrenAtPath;
