import type { Finding } from '../../../values/findings.mts';

export type DesignField = {
  readonly name: string;
  readonly mutable?: true | false;
  readonly private?: true | false;
};

type DesignParam = {
  readonly name: string;
  readonly type?: string | undefined;
  readonly variadic?: true | false;
  readonly optional?: true | false;
  readonly pattern?: true | false;
};

export type DesignCall = {
  readonly target: string;
  readonly line: number;
  readonly receiver?: string | undefined;
  readonly cleanup?: true | false;
  readonly branch?: readonly string[] | undefined;
  readonly mutation?: string | undefined;
};

type DesignForwardHop = { readonly target: string; readonly position: number };

export type DesignParamUse = {
  readonly param: number;
  readonly fields: readonly string[];
  readonly forwards: readonly DesignForwardHop[];
  readonly opaque?: true | false;
};

export type DesignDecision = {
  readonly subject: string;
  readonly groups: readonly (readonly string[])[];
  readonly line: number;
  readonly otherwise?: true | false;
};

type DesignRead = {
  readonly type: string;
  readonly fields: readonly string[];
  readonly decided?: readonly string[] | undefined;
  readonly line: number;
};

export type DesignForward = {
  readonly target: string;
  readonly arguments: readonly number[];
  readonly returned: boolean;
};

export type DesignType = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly kind: string;
  readonly exported: boolean;
  readonly fields?: readonly DesignField[];
  readonly supertypes?: readonly string[] | undefined;
  readonly cases?: readonly string[] | undefined;
  readonly published?: true | false;
  readonly references?: readonly string[] | undefined;
};

export type DesignCallable = {
  readonly id: string;
  readonly file: string;
  readonly name: string;
  readonly line: number;
  readonly kind: string;
  readonly exported: boolean;
  readonly owner?: string | undefined;
  readonly entry?: true | false;
  readonly published?: true | false;
  readonly params?: readonly DesignParam[];
  readonly returns?: string | undefined;
  readonly forward?: DesignForward | undefined;
  readonly calls?: readonly DesignCall[];
  readonly paramUses?: readonly DesignParamUse[];
  readonly ownFields?: readonly string[] | undefined;
  readonly returnsField?: string | undefined;
  readonly decisions?: readonly DesignDecision[];
  readonly reads?: readonly DesignRead[];
  readonly references?: readonly string[] | undefined;
};

export type DesignIndex = {
  readonly types: readonly DesignType[];
  readonly callables: readonly DesignCallable[];
  readonly type: (id: string | undefined) => DesignType | undefined;
  readonly callable: (id: string | undefined) => DesignCallable | undefined;
  readonly members: (ownerId: string) => readonly DesignCallable[];
  readonly isProduction: (item: { readonly file: string }) => boolean;
  readonly isPublished: (item: {
    readonly published?: true | false;
    readonly owner?: string | undefined;
  }) => boolean;
};

type DesignFindingInput = {
  readonly rule: string;
  readonly path: string;
  readonly identity: string;
  readonly symbol?: string | undefined;
  readonly line?: number | undefined;
  readonly message: string;
};

export type DesignFinding = (input: DesignFindingInput) => Finding[];

export type ProtocolContract = {
  readonly type: string;
  readonly open: readonly string[];
  readonly close: readonly string[];
  readonly steps?: readonly string[] | undefined;
};

export type DesignCallEntry = {
  readonly receiver: string;
  readonly owner: DesignType;
  readonly calls: (DesignCall & {
    readonly member: DesignCallable;
    readonly owner: DesignType;
  })[];
};
