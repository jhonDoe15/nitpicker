import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import {
  decoratorCall,
  decoratorsOf,
  declarationOf,
  importOf,
  isFromPackage,
  nameOf,
} from '../bindings/ts-nodes.mjs';
import { schemaProblems } from './schema-fields.mjs';

const MAX_DEPTH = 4;
const CLASS_VALIDATOR = ['class-validator'];
const CLASS_TRANSFORMER = ['class-transformer'];
const NEUTRAL_PACKAGES = [
  '@nestjs/swagger',
  '@nestjs/graphql',
  'class-validator',
  'class-transformer',
];
const VALIDATOR_KINDS = {
  IsInt: 'number',
  IsNumber: 'number',
  IsPositive: 'number',
  IsNegative: 'number',
  Min: 'number',
  Max: 'number',
  IsDivisibleBy: 'number',
  IsBoolean: 'boolean',
  IsDate: 'date',
  MinDate: 'date',
  MaxDate: 'date',
};
const KIND_ORDER = ['boolean', 'date', 'number'];
const MAPPED_TYPES = new Set(['PartialType', 'PickType', 'OmitType', 'IntersectionType']);
const ZOD_DTO_FACTORIES = new Set(['createZodDto']);

function returnsBoolean(argument) {
  if (argument === undefined || !ts.isArrowFunction(argument)) {
    return false;
  }
  return ts.isIdentifier(argument.body) && argument.body.text === 'Boolean';
}

function decoratorRole(decorator) {
  const call = decoratorCall(decorator);
  if (call.base === undefined) {
    return { coerces: true };
  }
  if (isFromPackage(call.base, CLASS_VALIDATOR)) {
    return { kind: VALIDATOR_KINDS[call.name], form: `@${call.name}()` };
  }
  if (isFromPackage(call.base, CLASS_TRANSFORMER)) {
    if (call.name === 'Transform') {
      return { coerces: true };
    }
    return call.name === 'Type'
      ? {
          castsBoolean: returnsBoolean(call.arguments[0]),
          coerces: !returnsBoolean(call.arguments[0]),
        }
      : {};
  }
  return isFromPackage(call.base, NEUTRAL_PACKAGES) ? {} : { coerces: true };
}

export function propertyProblem(property) {
  const roles = decoratorsOf(property).map((decorator) => decoratorRole(decorator));
  const kinds = roles.filter((role) => role.kind !== undefined);
  const kind = KIND_ORDER.find((name) => kinds.some((role) => role.kind === name));
  if (kind === undefined || roles.some((role) => role.coerces)) {
    return undefined;
  }
  const form = kinds.find((role) => role.kind === kind).form;
  const cast = kind === 'boolean' && roles.some((role) => role.castsBoolean);
  return cast
    ? { kind, cast, form: '@Type(() => Boolean)', library: 'class-validator' }
    : { kind, form, library: 'class-validator' };
}

function keyFilter(call) {
  const keys = call.arguments[1];
  if (call.name === 'PartialType' || call.name === 'IntersectionType' || keys === undefined) {
    return () => true;
  }
  if (!ts.isArrayLiteralExpression(keys)) {
    return () => true;
  }
  const names = new Set(keys.elements.map((element) => nameOf(element)));
  return (name) => names.has(name) === (call.name === 'PickType');
}

function heritageProblems(declaration, checker, depth) {
  const clause = declaration.heritageClauses?.find(
    (entry) => entry.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const base = clause?.types[0]?.expression;
  if (base === undefined) {
    return [];
  }
  if (ts.isIdentifier(base)) {
    return classProblems(base, checker, depth + 1) ?? [];
  }
  if (!ts.isCallExpression(base) || !ts.isIdentifier(base.expression)) {
    return [];
  }
  const name = importOf(base.expression)?.imported ?? base.expression.text;
  if (ZOD_DTO_FACTORIES.has(name)) {
    return schemaProblems(base.arguments[0], checker) ?? [];
  }
  if (!MAPPED_TYPES.has(name)) {
    return [];
  }
  const keep = keyFilter({ name, arguments: base.arguments });
  const sources = name === 'IntersectionType' ? base.arguments : base.arguments.slice(0, 1);
  return sources
    .filter((argument) => ts.isIdentifier(argument))
    .flatMap((argument) => classProblems(argument, checker, depth + 1) ?? [])
    .filter(({ field }) => keep(field));
}

function ownProperties(declaration) {
  return declaration.members.filter(
    (member) => ts.isPropertyDeclaration(member) && nameOf(member.name) !== undefined,
  );
}

function ownProblems(declaration) {
  return ownProperties(declaration).flatMap((member) => {
    const problem = propertyProblem(member);
    return problem === undefined ? [] : [{ field: nameOf(member.name), node: member, problem }];
  });
}

export function classProblems(identifier, checker, depth = 0) {
  const declaration = depth > MAX_DEPTH ? undefined : declarationOf(identifier, checker);
  if (declaration === undefined || !ts.isClassDeclaration(declaration)) {
    return undefined;
  }
  const own = ownProblems(declaration);
  const names = new Set(ownProperties(declaration).map((member) => nameOf(member.name)));
  const inherited = heritageProblems(declaration, checker, depth).filter(
    ({ field }) => !names.has(field),
  );
  return [...own, ...inherited];
}
