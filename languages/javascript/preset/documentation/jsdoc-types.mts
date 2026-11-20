export type JsdocTag = {
  readonly tag: string;
  readonly type?: string;
  readonly name?: string;
};

export type JsdocProblem = {
  readonly messageId: string;
  readonly data?: Readonly<Record<string, string>>;
};

export type ParsedJsdoc = { readonly tags: JsdocTag[]; readonly problems: JsdocProblem[] };

export type TagSelector = (tags: readonly JsdocTag[]) => readonly JsdocTag[];

export type JsdocReport<MessageIds extends string = string> = {
  readonly selectTags: TagSelector;
  readonly messageId: MessageIds;
  readonly data: Readonly<Record<string, string>> | undefined;
};

export type Grammar = {
  readonly type?: 'required' | 'optional';
  readonly name?: RegExp;
  readonly whole?: RegExp;
  readonly usage: string;
};

export type Segment = { text: string };

export type TaggedSegment = Segment & { readonly tag: string };

export type TagEntry = { type?: string; name?: string };

export type ParsedBody = { readonly entry: TagEntry; readonly rest: string };

export type Opener = { readonly character: string; readonly start: number };

export type MemberRegion = readonly [number, number];
export type JsdocComment<Loc> = {
  readonly type: string;
  readonly value: string;
  readonly loc: Loc;
};

export type JsdocContext<Loc, MessageIds extends string = string> = {
  readonly options: readonly unknown[];
  readonly sourceCode: { getAllComments(): readonly JsdocComment<Loc>[] };
  report(descriptor: {
    readonly loc: Loc;
    readonly messageId: MessageIds;
    readonly data?: Readonly<Record<string, string>>;
  }): void;
};
