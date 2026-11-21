export type XmlElement = {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string | undefined>>;
  readonly children: readonly XmlElement[];
  readonly text?: string;
};

export type XmlNode = {
  readonly name: string;
  readonly attrs: Record<string, string>;
  readonly children: XmlNode[];
  text?: string;
};

export type XmlStack = XmlNode[];

export type XmlOpening = {
  readonly name: string;
  readonly rest: string | undefined;
  readonly selfClosing: string | undefined;
  readonly contentStart: number;
  readonly contentStarts: Map<XmlNode, number>;
};

export type XmlClosing = {
  readonly name: string;
  readonly text: string;
  readonly end: number;
  readonly contentStarts: ReadonlyMap<XmlNode, number>;
};

export type XmlScan = {
  readonly stack: XmlStack;
  readonly text: string;
  readonly contentStarts: Map<XmlNode, number>;
};

export type LineIdentityInput = {
  readonly file: string;
  readonly line?: number | undefined;
  readonly parts: readonly string[];
};
