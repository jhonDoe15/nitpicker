import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import { classProblems } from '../fields/dto-fields.mts';
import { leafProblem, schemaProblems } from '../fields/schema-fields.mts';
import type { Checker, Finding, Kind, Located, Problem } from '../problem-types.mts';
import { nameOf } from './import-bindings.mts';
import { decoratorCall, decoratorsOf, importOf, isFromPackage } from './ts-nodes.mts';

type Transport = { readonly source: string; readonly arguments: TypeScript.Expression[] };
type KindPart = { readonly kind?: Kind | undefined; readonly inner?: TypeScript.TypeNode[] };
type Pipes = readonly TypeScript.Expression[];
type SingleSite = {
  readonly name: string;
  readonly pipes: Pipes;
  readonly parameter: TypeScript.ParameterDeclaration;
};

const NEST = ['@nestjs/common'];
const SOURCES: Readonly<Record<string, string>> = {
  Query: 'query string',
  Param: 'path',
  Headers: 'headers',
};
const MULTIPART = 'multipart form';
const FILE_INTERCEPTORS = new Set<string | undefined>([
  'FileInterceptor',
  'FilesInterceptor',
  'AnyFilesInterceptor',
  'FileFieldsInterceptor',
]);
const FILE_PARAMETERS = new Set<string | undefined>(['UploadedFile', 'UploadedFiles']);
const PASSIVE_PIPES = new Set<string | undefined>(['DefaultValuePipe', 'ParseUUIDPipe']);
const ZOD_PIPES = new Set<string | undefined>(['ZodValidationPipe']);
const ARRAY_PIPES: Readonly<Partial<Record<Kind, string>>> = {
  number: 'new ParseArrayPipe({ items: Number })',
  bigint: 'a pipe that splits the text and calls BigInt on each item',
  date: 'a pipe that splits the text and builds a Date from each item',
  boolean: "a pipe that splits the text and compares each item with 'true'",
};
const OPTIONAL_PIPES: Readonly<Partial<Record<Kind, string>>> = {
  number: 'new ParseIntPipe({ optional: true }) or new ParseFloatPipe({ optional: true })',
  bigint: 'a pipe that calls BigInt when the value is present',
  date: 'new ParseDatePipe({ optional: true })',
  boolean: 'new ParseBoolPipe({ optional: true })',
};
const NULLISH = new Set<TypeScript.SyntaxKind>([
  ts.SyntaxKind.UndefinedKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.LiteralType,
]);
const KEYWORD_KINDS = new Map<TypeScript.SyntaxKind, Kind>([
  [ts.SyntaxKind.NumberKeyword, 'number'],
  [ts.SyntaxKind.BigIntKeyword, 'bigint'],
  [ts.SyntaxKind.BooleanKeyword, 'boolean'],
]);

function calledName(node: TypeScript.Node): string | undefined {
  const callee = ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression : node;
  return ts.isIdentifier(callee) ? (importOf(callee)?.imported ?? callee.text) : undefined;
}

function isFileInterceptor(argument: TypeScript.Expression): boolean {
  return ts.isCallExpression(argument) && FILE_INTERCEPTORS.has(calledName(argument));
}

function isMultipart(method: TypeScript.MethodDeclaration): boolean {
  const intercepted = decoratorsOf(method).some((decorator) => {
    const call = decoratorCall(decorator);
    return call.name === 'UseInterceptors' && call.arguments.some(isFileInterceptor);
  });
  return (
    intercepted ||
    method.parameters.some((parameter) =>
      decoratorsOf(parameter).some((decorator) =>
        FILE_PARAMETERS.has(decoratorCall(decorator).name),
      ),
    )
  );
}

function transportOf(
  parameter: TypeScript.ParameterDeclaration,
  multipart: boolean,
): Transport | undefined {
  for (const decorator of decoratorsOf(parameter)) {
    const call = decoratorCall(decorator);
    const fromNest = call.base !== undefined && isFromPackage(call.base, NEST);
    const source =
      (call.name === undefined ? undefined : SOURCES[call.name]) ??
      (call.name === 'Body' && multipart ? MULTIPART : undefined);
    if (fromNest && source !== undefined) {
      return { source, arguments: call.arguments };
    }
  }
  return undefined;
}

function isNullish(type: TypeScript.TypeNode): boolean {
  if (!NULLISH.has(type.kind)) {
    return false;
  }
  return !ts.isLiteralTypeNode(type) || type.literal.kind === ts.SyntaxKind.NullKeyword;
}

function literalKind(type: TypeScript.LiteralTypeNode): Kind | undefined {
  const { literal } = type;
  if (ts.isNumericLiteral(literal) || ts.isPrefixUnaryExpression(literal)) {
    return 'number';
  }
  const isBoolean =
    literal.kind === ts.SyntaxKind.TrueKeyword || literal.kind === ts.SyntaxKind.FalseKeyword;
  return isBoolean ? 'boolean' : undefined;
}

function partKind(type: TypeScript.TypeNode): KindPart {
  const keyword = KEYWORD_KINDS.get(type.kind);
  if (keyword !== undefined) {
    return { kind: keyword };
  }
  if (ts.isArrayTypeNode(type)) {
    return { inner: [type.elementType] };
  }
  if (ts.isParenthesizedTypeNode(type)) {
    return { inner: [type.type] };
  }
  if (ts.isUnionTypeNode(type)) {
    return { inner: type.types.filter((part) => !isNullish(part)) };
  }
  if (ts.isLiteralTypeNode(type)) {
    return { kind: literalKind(type) };
  }
  const isDate = ts.isTypeReferenceNode(type) && nameOf(type.typeName) === 'Date';
  return { kind: isDate ? 'date' : undefined };
}

function typeKind(type: TypeScript.TypeNode | undefined): Kind | undefined {
  const pending = type === undefined ? [] : [type];
  const kinds = new Set<Kind | undefined>();
  for (const current of pending) {
    const part = partKind(current);
    if (part.inner === undefined) {
      kinds.add(part.kind);
    } else {
      pending.push(...part.inner);
    }
  }
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

function typeProblem(type: TypeScript.TypeNode | undefined): Problem | undefined {
  const kind = typeKind(type);
  return kind === undefined || type === undefined
    ? undefined
    : { kind, form: `the type ${type.getText()}`, library: 'type' };
}

function literalMembers(type: TypeScript.TypeLiteralNode): Finding[] {
  return type.members.flatMap((member) => {
    if (!ts.isPropertySignature(member)) {
      return [];
    }
    const field = nameOf(member.name);
    const problem = field === undefined ? undefined : typeProblem(member.type);
    return field === undefined || problem === undefined ? [] : [{ field, node: member, problem }];
  });
}

function typeParts(type: TypeScript.TypeNode | undefined): TypeScript.TypeNode[] {
  const pending = type === undefined ? [] : [type];
  for (const current of pending) {
    if (ts.isUnionTypeNode(current)) {
      pending.push(...current.types);
    }
    if (ts.isParenthesizedTypeNode(current)) {
      pending.push(current.type);
    }
  }
  return pending;
}

function pipeFix(kind: Kind, parameter: TypeScript.ParameterDeclaration): string | undefined {
  const parts = typeParts(parameter.type);
  if (parts.some((part) => ts.isArrayTypeNode(part))) {
    return ARRAY_PIPES[kind];
  }
  const optional =
    parameter.questionToken !== undefined ||
    parts.some((part) => part.kind === ts.SyntaxKind.UndefinedKeyword);
  return optional ? OPTIONAL_PIPES[kind] : undefined;
}

function firstArgument(pipe: TypeScript.Expression): TypeScript.Expression | undefined {
  return ts.isCallExpression(pipe) || ts.isNewExpression(pipe) ? pipe.arguments?.[0] : undefined;
}

function singleProblems({ name, pipes, parameter }: SingleSite, checker: Checker): Finding[] {
  const zodPipe = pipes.find((pipe) => ZOD_PIPES.has(calledName(pipe)));
  if (zodPipe !== undefined) {
    const problem = leafProblem(firstArgument(zodPipe), checker);
    return problem === undefined ? [] : [{ field: name, node: zodPipe, problem }];
  }
  if (pipes.some((pipe) => !PASSIVE_PIPES.has(calledName(pipe)))) {
    return [];
  }
  const problem = typeProblem(parameter.type);
  return problem === undefined
    ? []
    : [
        {
          field: name,
          node: parameter,
          problem: { ...problem, library: 'param', fix: pipeFix(problem.kind, parameter) },
        },
      ];
}

function objectProblems(
  pipes: Pipes,
  parameter: TypeScript.ParameterDeclaration,
  checker: Checker,
): Finding[] {
  const zodPipe = pipes.find((pipe) => ZOD_PIPES.has(calledName(pipe)));
  if (zodPipe !== undefined) {
    return schemaProblems(firstArgument(zodPipe), checker) ?? [];
  }
  const { type } = parameter;
  if (type !== undefined && ts.isTypeLiteralNode(type)) {
    return literalMembers(type);
  }
  return type !== undefined && ts.isTypeReferenceNode(type)
    ? (classProblems(type.typeName, checker) ?? [])
    : [];
}

function parameterProblems(
  parameter: TypeScript.ParameterDeclaration,
  multipart: boolean,
  checker: Checker,
): Located[] {
  const transport = transportOf(parameter, multipart);
  if (transport === undefined) {
    return [];
  }
  const [first, ...rest] = transport.arguments;
  const found =
    first !== undefined && ts.isStringLiteralLike(first)
      ? singleProblems({ name: first.text, pipes: rest, parameter }, checker)
      : objectProblems(transport.arguments, parameter, checker);
  return found.map((entry) => ({ ...entry, source: transport.source, binding: parameter }));
}

export function handlerProblems(method: TypeScript.MethodDeclaration, checker: Checker): Located[] {
  const multipart = isMultipart(method);
  return method.parameters.flatMap((parameter) => parameterProblems(parameter, multipart, checker));
}
