import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { baseIdentifier, importOf, isFromPackage } from '../bindings/ts-nodes.mts';
import type { Kind } from '../problem-types.mts';

type SchemaLibrary = {
  readonly id: 'zod' | 'valibot';
  readonly packages: readonly string[];
  readonly objects: readonly string[];
  readonly wrappers: readonly string[];
  readonly kinds: Readonly<Record<string, Kind>>;
};
export type LibraryCall =
  | {
      readonly library: SchemaLibrary;
      readonly name: string | undefined;
      readonly coerce?: undefined;
      readonly display?: string;
    }
  | {
      readonly library: SchemaLibrary;
      readonly name: string;
      readonly coerce: true;
      readonly display: string;
    };
export type MethodCall = TypeScript.CallExpression & {
  readonly expression: TypeScript.PropertyAccessExpression;
};

export function listed(names: readonly string[], name: string | undefined): boolean {
  return name !== undefined && names.includes(name);
}

const NUMBER = 'number';
const BIGINT = 'bigint';
const BOOLEAN = 'boolean';
const DATE = 'date';

const SCHEMA_LIBRARIES: readonly SchemaLibrary[] = [
  {
    id: 'zod',
    packages: ['zod', 'nestjs-zod'],
    objects: ['object', 'strictObject', 'looseObject'],
    wrappers: ['optional', 'nullable', 'nullish', 'array', 'readonly', 'nonoptional', 'default'],
    kinds: {
      number: NUMBER,
      int: NUMBER,
      int32: NUMBER,
      uint32: NUMBER,
      float32: NUMBER,
      float64: NUMBER,
      int64: BIGINT,
      uint64: BIGINT,
      bigint: BIGINT,
      boolean: BOOLEAN,
      date: DATE,
    },
  },
  {
    id: 'valibot',
    packages: ['valibot'],
    objects: ['object', 'strictObject', 'looseObject', 'objectWithRest'],
    wrappers: [
      'optional',
      'nullable',
      'nullish',
      'array',
      'exactOptional',
      'undefinedable',
      'nonOptional',
      'nonNullable',
      'nonNullish',
      'pipe',
      'pipeAsync',
      'fallback',
    ],
    kinds: { number: NUMBER, bigint: BIGINT, boolean: BOOLEAN, date: DATE },
  },
];

function libraryOf(identifier: TypeScript.Identifier): SchemaLibrary | undefined {
  return SCHEMA_LIBRARIES.find((library) => isFromPackage(identifier, library.packages));
}

function namespaceCall(
  callee: TypeScript.PropertyAccessExpression,
  library: SchemaLibrary,
): LibraryCall | undefined {
  const owner = callee.expression;
  if (ts.isIdentifier(owner)) {
    return { library, name: callee.name.text, display: `${owner.text}.${callee.name.text}()` };
  }
  if (
    ts.isPropertyAccessExpression(owner) &&
    ts.isIdentifier(owner.expression) &&
    owner.name.text === 'coerce'
  ) {
    return {
      library,
      name: callee.name.text,
      coerce: true,
      display: `${owner.expression.text}.coerce.${callee.name.text}()`,
    };
  }
  return undefined;
}

export function libraryCall(node: TypeScript.Node): LibraryCall | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.expression;
  const base = baseIdentifier(callee);
  const library = base === undefined ? undefined : libraryOf(base);
  if (library === undefined) {
    return undefined;
  }
  if (ts.isIdentifier(callee)) {
    const imported = importOf(callee)?.imported;
    return imported === '*' || imported === 'default' ? undefined : { library, name: imported };
  }
  return ts.isPropertyAccessExpression(callee) ? namespaceCall(callee, library) : undefined;
}

export function isMethodCall(node: TypeScript.Node): node is MethodCall {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    libraryCall(node) === undefined
  );
}
