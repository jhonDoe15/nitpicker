import { ts } from '../../../../../typescript-api/typescript-api.mjs';
import {
  decoratorCall,
  decoratorsOf,
  declarationOf,
  importOf,
  isFromPackage,
  nameOf,
  resolvedExpression,
} from '../bindings/ts-nodes.mjs';
import { schemaProblems } from './schema-fields.mjs';

const MAX_CLASSES = 8;
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
const KEY_PICKERS = new Set(['PickType', 'OmitType']);
const ZOD_DTO_FACTORIES = new Set(['createZodDto']);

function returnsBoolean(argument) {
  return (
    argument !== undefined &&
    ts.isArrowFunction(argument) &&
    ts.isIdentifier(argument.body) &&
    argument.body.text === 'Boolean'
  );
}

function transformerRole(call) {
  if (call.name === 'Transform') {
    return { coerces: true };
  }
  if (call.name !== 'Type') {
    return {};
  }
  const castsBoolean = returnsBoolean(call.arguments[0]);
  return { castsBoolean, coerces: !castsBoolean };
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
    return transformerRole(call);
  }
  return isFromPackage(call.base, NEUTRAL_PACKAGES) ? {} : { coerces: true };
}

function propertyProblem(property) {
  const roles = decoratorsOf(property).map((decorator) => decoratorRole(decorator));
  const kinds = roles.filter((role) => role.kind !== undefined);
  const kind = KIND_ORDER.find((name) => kinds.some((role) => role.kind === name));
  if (kind === undefined || roles.some((role) => role.coerces)) {
    return undefined;
  }
  const { form } = kinds.find((role) => role.kind === kind);
  return kind === 'boolean' && roles.some((role) => role.castsBoolean)
    ? { kind, cast: true, form: '@Type(() => Boolean)', library: 'class-validator' }
    : { kind, form, library: 'class-validator' };
}

function keyFilter(name, argument, checker) {
  const keys = resolvedExpression(argument, checker);
  if (!KEY_PICKERS.has(name) || keys === undefined || !ts.isArrayLiteralExpression(keys)) {
    return () => true;
  }
  const names = new Set(keys.elements.map((element) => nameOf(element)));
  return (field) => names.has(field) === (name === 'PickType');
}

function both(first, second) {
  return (field) => first(field) && second(field);
}

function heritageBase(declaration) {
  const clause = declaration.heritageClauses?.find(
    (entry) => entry.token === ts.SyntaxKind.ExtendsKeyword,
  );
  return clause?.types[0]?.expression;
}

function mappedSources(base) {
  if (!ts.isCallExpression(base) || !ts.isIdentifier(base.expression)) {
    return { name: undefined, sources: [] };
  }
  const name = importOf(base.expression)?.imported ?? base.expression.text;
  if (ZOD_DTO_FACTORIES.has(name)) {
    return { name, schema: base.arguments[0], sources: [] };
  }
  if (!MAPPED_TYPES.has(name)) {
    return { name, sources: [] };
  }
  const sources = name === 'IntersectionType' ? base.arguments : base.arguments.slice(0, 1);
  return { name, sources: sources.filter((argument) => ts.isIdentifier(argument)) };
}

function ownProperties(declaration) {
  return declaration.members.filter(
    (member) => ts.isPropertyDeclaration(member) && nameOf(member.name) !== undefined,
  );
}

function visible(entry, field) {
  return !entry.hidden.has(field) && entry.keep(field);
}

function ownProblems(declaration, entry) {
  return ownProperties(declaration).flatMap((member) => {
    const field = nameOf(member.name);
    const problem = visible(entry, field) ? propertyProblem(member) : undefined;
    return problem === undefined ? [] : [{ field, node: member, problem }];
  });
}

function inheritedEntries(declaration, entry, checker) {
  const base = heritageBase(declaration);
  const hidden = new Set([
    ...entry.hidden,
    ...ownProperties(declaration).map((m) => nameOf(m.name)),
  ]);
  if (base === undefined) {
    return { entries: [] };
  }
  if (ts.isIdentifier(base)) {
    return { entries: [{ identifier: base, hidden, keep: entry.keep }] };
  }
  const mapped = mappedSources(base);
  const filter = keyFilter(
    mapped.name,
    ts.isCallExpression(base) ? base.arguments[1] : undefined,
    checker,
  );
  const keep = both(entry.keep, filter);
  return {
    entries: mapped.sources.map((identifier) => ({ identifier, hidden, keep })),
    schema: mapped.schema === undefined ? undefined : { expression: mapped.schema, hidden, keep },
  };
}

function schemaEntryProblems(schema, checker) {
  return (schemaProblems(schema.expression, checker) ?? []).filter(({ field }) =>
    visible(schema, field),
  );
}

function aliasedName(declaration) {
  return declaration !== undefined &&
    ts.isTypeAliasDeclaration(declaration) &&
    ts.isTypeReferenceNode(declaration.type)
    ? declaration.type.typeName
    : undefined;
}

function classDeclaration(name, checker) {
  const pending = [name];
  for (const current of pending) {
    const identifier = ts.isQualifiedName(current) ? current.right : current;
    const usable = ts.isIdentifier(identifier) && (checker !== undefined || identifier === current);
    const declaration = usable ? declarationOf(identifier, checker) : undefined;
    if (declaration !== undefined && ts.isClassDeclaration(declaration)) {
      return declaration;
    }
    const target = aliasedName(declaration);
    if (target !== undefined && pending.length < MAX_CLASSES) {
      pending.push(target);
    }
  }
  return undefined;
}

export function classProblems(name, checker) {
  if (classDeclaration(name, checker) === undefined) {
    return undefined;
  }
  const pending = [{ identifier: name, hidden: new Set(), keep: () => true }];
  const problems = [];
  for (const entry of pending) {
    const declaration = classDeclaration(entry.identifier, checker);
    if (declaration !== undefined) {
      const inherited = inheritedEntries(declaration, entry, checker);
      problems.push(...ownProblems(declaration, entry));
      problems.push(
        ...(inherited.schema === undefined ? [] : schemaEntryProblems(inherited.schema, checker)),
      );
      pending.push(...inherited.entries.slice(0, Math.max(0, MAX_CLASSES - pending.length)));
    }
  }
  return problems;
}
