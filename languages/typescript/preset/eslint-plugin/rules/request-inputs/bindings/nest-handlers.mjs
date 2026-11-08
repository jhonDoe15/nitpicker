import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import { classProblems } from '../fields/dto-fields.mjs';
import { leafProblem, schemaProblems } from '../fields/schema-fields.mjs';
import { decoratorCall, decoratorsOf, importOf, isFromPackage, nameOf } from './ts-nodes.mjs';

const NEST = ['@nestjs/common'];
const SOURCES = { Query: 'query string', Param: 'path', Headers: 'headers' };
const MULTIPART = 'multipart form';
const FILE_INTERCEPTORS = new Set([
  'FileInterceptor',
  'FilesInterceptor',
  'AnyFilesInterceptor',
  'FileFieldsInterceptor',
]);
const FILE_PARAMETERS = new Set(['UploadedFile', 'UploadedFiles']);
const PASSIVE_PIPES = new Set(['DefaultValuePipe', 'ParseUUIDPipe']);
const ZOD_PIPES = new Set(['ZodValidationPipe']);
const NULLISH = new Set([
  ts.SyntaxKind.UndefinedKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.LiteralType,
]);
const KEYWORD_KINDS = new Map([
  [ts.SyntaxKind.NumberKeyword, 'number'],
  [ts.SyntaxKind.BigIntKeyword, 'bigint'],
  [ts.SyntaxKind.BooleanKeyword, 'boolean'],
]);

function calledName(node) {
  const callee = ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression : node;
  return ts.isIdentifier(callee) ? (importOf(callee)?.imported ?? callee.text) : undefined;
}

function isFileInterceptor(argument) {
  return ts.isCallExpression(argument) && FILE_INTERCEPTORS.has(calledName(argument));
}

function isMultipart(method) {
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

function transportOf(parameter, multipart) {
  for (const decorator of decoratorsOf(parameter)) {
    const call = decoratorCall(decorator);
    const fromNest = call.base !== undefined && isFromPackage(call.base, NEST);
    const source =
      SOURCES[call.name] ?? (call.name === 'Body' && multipart ? MULTIPART : undefined);
    if (fromNest && source !== undefined) {
      return { source, arguments: call.arguments };
    }
  }
  return undefined;
}

function isNullish(type) {
  if (!NULLISH.has(type.kind)) {
    return false;
  }
  return type.kind !== ts.SyntaxKind.LiteralType || type.literal.kind === ts.SyntaxKind.NullKeyword;
}

function literalKind(type) {
  const { literal } = type;
  if (ts.isNumericLiteral(literal) || ts.isPrefixUnaryExpression(literal)) {
    return 'number';
  }
  const isBoolean =
    literal.kind === ts.SyntaxKind.TrueKeyword || literal.kind === ts.SyntaxKind.FalseKeyword;
  return isBoolean ? 'boolean' : undefined;
}

function typeKind(type) {
  if (type === undefined) {
    return undefined;
  }
  if (KEYWORD_KINDS.has(type.kind)) {
    return KEYWORD_KINDS.get(type.kind);
  }
  if (ts.isArrayTypeNode(type) || ts.isParenthesizedTypeNode(type)) {
    return typeKind(ts.isArrayTypeNode(type) ? type.elementType : type.type);
  }
  if (ts.isLiteralTypeNode(type)) {
    return literalKind(type);
  }
  if (ts.isTypeReferenceNode(type)) {
    return nameOf(type.typeName) === 'Date' ? 'date' : undefined;
  }
  if (!ts.isUnionTypeNode(type)) {
    return undefined;
  }
  const kinds = new Set(type.types.filter((part) => !isNullish(part)).map(typeKind));
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

export function typeProblem(type) {
  const kind = typeKind(type);
  return kind === undefined
    ? undefined
    : { kind, form: `the type ${type.getText()}`, library: 'type' };
}

function literalMembers(type) {
  return type.members.flatMap((member) => {
    const problem = ts.isPropertySignature(member) ? typeProblem(member.type) : undefined;
    return problem === undefined ? [] : [{ field: nameOf(member.name), node: member, problem }];
  });
}

function singleProblems(name, pipes, parameter, checker) {
  const zodPipe = pipes.find((pipe) => ZOD_PIPES.has(calledName(pipe)));
  if (zodPipe !== undefined) {
    const problem = leafProblem(zodPipe.arguments?.[0], checker);
    return problem === undefined ? [] : [{ field: name, node: zodPipe, problem }];
  }
  if (pipes.some((pipe) => !PASSIVE_PIPES.has(calledName(pipe)))) {
    return [];
  }
  const problem = typeProblem(parameter.type);
  return problem === undefined
    ? []
    : [{ field: name, node: parameter, problem: { ...problem, library: 'param' } }];
}

function objectProblems(pipes, parameter, checker) {
  const zodPipe = pipes.find((pipe) => ZOD_PIPES.has(calledName(pipe)));
  if (zodPipe !== undefined) {
    return schemaProblems(zodPipe.arguments?.[0], checker) ?? [];
  }
  const { type } = parameter;
  if (type !== undefined && ts.isTypeLiteralNode(type)) {
    return literalMembers(type);
  }
  return type !== undefined && ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)
    ? (classProblems(type.typeName, checker) ?? [])
    : [];
}

function parameterProblems(parameter, multipart, checker) {
  const transport = transportOf(parameter, multipart);
  if (transport === undefined) {
    return [];
  }
  const [first, ...rest] = transport.arguments;
  const single = first !== undefined && ts.isStringLiteralLike(first);
  const found = single
    ? singleProblems(first.text, rest, parameter, checker)
    : objectProblems(transport.arguments, parameter, checker);
  return found.map((entry) => ({ ...entry, source: transport.source, binding: parameter }));
}

export function handlerProblems(method, checker) {
  const multipart = isMultipart(method);
  return method.parameters.flatMap((parameter) => parameterProblems(parameter, multipart, checker));
}
