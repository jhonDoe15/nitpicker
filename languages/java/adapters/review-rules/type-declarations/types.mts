import type { Span } from '../max-value-sums/sum-types.mts';

export type MethodDecl = {
  readonly name: string;
  readonly params: readonly string[];
  readonly paramTypes: readonly string[];
  readonly modifiers: ReadonlySet<string>;
  readonly selfContained: boolean;
  readonly forwardsTo: string | undefined;
};

export type FieldDecl = {
  readonly name: string;
  readonly index: number;
  readonly type: string;
  readonly generated: boolean;
  readonly modifiers: ReadonlySet<string>;
  readonly array: boolean;
};

export type TypeKind = 'class' | 'interface' | 'enum' | 'record';

export type TypeDecl = {
  readonly name: string;
  readonly kind: TypeKind;
  readonly pkg: string;
  readonly scope: string;
  readonly imports: readonly string[];
  readonly file: string;
  readonly line: number;
  readonly body: Span;
  readonly superclass: string | undefined;
  readonly interfaces: readonly string[];
  readonly methods: readonly MethodDecl[];
  readonly fields: readonly FieldDecl[];
};

export type FileContext = {
  readonly file: string;
  readonly pkg: string;
  readonly imports: readonly string[];
};

export function methodKey(method: Pick<MethodDecl, 'name' | 'params'>): string {
  return `${method.name}/${String(method.params.length)}`;
}

const PLAIN_TYPES = new Set([
  'boolean',
  'byte',
  'char',
  'short',
  'int',
  'long',
  'float',
  'double',
  'String',
  'Boolean',
  'Byte',
  'Character',
  'Short',
  'Integer',
  'Long',
  'Float',
  'Double',
]);

export function sameSignature(left: MethodDecl, right: MethodDecl): boolean {
  return (
    left.name === right.name &&
    left.params.length === right.params.length &&
    left.paramTypes.every((type, at) => {
      const other = right.paramTypes[at] ?? '?';
      return type === other || !PLAIN_TYPES.has(type) || !PLAIN_TYPES.has(other);
    })
  );
}
