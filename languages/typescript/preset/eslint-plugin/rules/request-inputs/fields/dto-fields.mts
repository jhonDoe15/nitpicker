import type TypeScript from 'typescript';
import { ts } from '../../typed/typescript-views.mts';
import {
  decoratorCall,
  type DecoratorCall,
  decoratorsOf,
  declarationOf,
  importOf,
  isFromPackage,
  resolvedExpression,
} from '../bindings/ts-nodes.mts';
import { nameOf } from '../bindings/import-bindings.mts';
import type { Checker, Finding, Kind, Problem } from '../problem-types.mts';
import { schemaProblems } from './schema-fields.mts';

type Role = {
  readonly kind?: Kind | undefined;
  readonly form?: string | undefined;
  readonly coerces: boolean;
  readonly castsBoolean: boolean;
};
type Filter = (field: string) => boolean;
type Hidden = {
  readonly hidden: ReadonlySet<string | undefined>;
  readonly keep: Filter;
};
type ClassEntry = Hidden & { readonly identifier: TypeScript.EntityName };
type SchemaEntry = Hidden & { readonly expression: TypeScript.Expression };

const MAX_CLASSES = 8;
const NUMBER = 'number';
const BOOLEAN = 'boolean';
const DATE = 'date';
const VALIDATOR_PACKAGE = 'class-validator';
const PICK_TYPE = 'PickType';
const COERCING: Role = { coerces: true, castsBoolean: false };
const INERT: Role = { coerces: false, castsBoolean: false };
const CLASS_VALIDATOR = [VALIDATOR_PACKAGE];
const CLASS_TRANSFORMER = ['class-transformer'];
const NEUTRAL_PACKAGES = [
  '@nestjs/swagger',
  '@nestjs/graphql',
  VALIDATOR_PACKAGE,
  'class-transformer',
];
const VALIDATOR_KINDS: Readonly<Record<string, Kind>> = {
  IsInt: NUMBER,
  IsNumber: NUMBER,
  IsPositive: NUMBER,
  IsNegative: NUMBER,
  Min: NUMBER,
  Max: NUMBER,
  IsDivisibleBy: NUMBER,
  IsBoolean: BOOLEAN,
  IsDate: DATE,
  MinDate: DATE,
  MaxDate: DATE,
};
const KIND_ORDER: readonly Kind[] = [BOOLEAN, DATE, NUMBER];
const MAPPED_TYPES = new Set(['PartialType', PICK_TYPE, 'OmitType', 'IntersectionType']);
const KEY_PICKERS = new Set<string | undefined>([PICK_TYPE, 'OmitType']);
const ZOD_DTO_FACTORIES = new Set(['createZodDto']);

function returnsBoolean(argument: TypeScript.Expression | undefined): boolean {
  return (
    argument !== undefined &&
    ts.isArrowFunction(argument) &&
    ts.isIdentifier(argument.body) &&
    argument.body.text === 'Boolean'
  );
}

function transformerRole(call: DecoratorCall): Role {
  if (call.name === 'Transform') {
    return COERCING;
  }
  if (call.name !== 'Type') {
    return INERT;
  }
  const castsBoolean = returnsBoolean(call.arguments[0]);
  return { castsBoolean, coerces: !castsBoolean };
}

function decoratorRole(decorator: TypeScript.Decorator): Role {
  const call = decoratorCall(decorator);
  if (call.base === undefined) {
    return COERCING;
  }
  if (isFromPackage(call.base, CLASS_VALIDATOR)) {
    return {
      kind: call.name === undefined ? undefined : VALIDATOR_KINDS[call.name],
      form: `@${call.name ?? ''}()`,
      coerces: false,
      castsBoolean: false,
    };
  }
  if (isFromPackage(call.base, CLASS_TRANSFORMER)) {
    return transformerRole(call);
  }
  return isFromPackage(call.base, NEUTRAL_PACKAGES) ? INERT : COERCING;
}

function propertyProblem(property: TypeScript.PropertyDeclaration): Problem | undefined {
  const roles = decoratorsOf(property).map((decorator) => decoratorRole(decorator));
  const kinds = roles.filter((role) => role.kind !== undefined);
  const present = new Set(kinds.map((role) => role.kind));
  const kind = KIND_ORDER.find((name) => present.has(name));
  if (kind === undefined || roles.some((role) => role.coerces)) {
    return undefined;
  }
  const form = kinds.find((role) => role.kind === kind)?.form ?? '';
  return kind === BOOLEAN && roles.some((role) => role.castsBoolean)
    ? { kind, cast: true, form: '@Type(() => Boolean)', library: VALIDATOR_PACKAGE }
    : { kind, form, library: VALIDATOR_PACKAGE };
}

function keyFilter(
  name: string | undefined,
  argument: TypeScript.Expression | undefined,
  checker: Checker,
): Filter {
  const keys = resolvedExpression(argument, checker);
  if (!KEY_PICKERS.has(name) || keys === undefined || !ts.isArrayLiteralExpression(keys)) {
    return () => true;
  }
  const names = new Set(keys.elements.map((element) => nameOf(element)));
  return (field) => names.has(field) === (name === PICK_TYPE);
}

function both(first: Filter, second: Filter): Filter {
  return (field) => first(field) && second(field);
}

function heritageBase(declaration: TypeScript.ClassDeclaration): TypeScript.Expression | undefined {
  const clause = declaration.heritageClauses?.find(
    (entry) => entry.token === ts.SyntaxKind.ExtendsKeyword,
  );
  return clause?.types[0]?.expression;
}

function mappedSources(base: TypeScript.Expression): {
  readonly name: string | undefined;
  readonly schema?: TypeScript.Expression | undefined;
  readonly sources: TypeScript.Identifier[];
} {
  if (!(ts.isCallExpression(base) && ts.isIdentifier(base.expression))) {
    return { name: undefined, sources: [] };
  }
  const name = importOf(base.expression)?.imported ?? base.expression.text;
  if (ZOD_DTO_FACTORIES.has(name)) {
    return { name, schema: base.arguments[0], sources: [] };
  }
  if (!MAPPED_TYPES.has(name)) {
    return { name, sources: [] };
  }
  const sources: readonly TypeScript.Expression[] =
    name === 'IntersectionType' ? base.arguments : base.arguments.slice(0, 1);
  return { name, sources: sources.filter(ts.isIdentifier) };
}

function ownProperties(declaration: TypeScript.ClassDeclaration): TypeScript.PropertyDeclaration[] {
  return declaration.members
    .filter(ts.isPropertyDeclaration)
    .filter((member) => nameOf(member.name) !== undefined);
}

function visible(entry: Hidden, field: string): boolean {
  return !entry.hidden.has(field) && entry.keep(field);
}

function ownProblems(declaration: TypeScript.ClassDeclaration, entry: Hidden): Finding[] {
  return ownProperties(declaration).flatMap((member) => {
    const field = nameOf(member.name);
    const problem =
      field !== undefined && visible(entry, field) ? propertyProblem(member) : undefined;
    return field === undefined || problem === undefined ? [] : [{ field, node: member, problem }];
  });
}

function inheritedEntries(
  declaration: TypeScript.ClassDeclaration,
  entry: ClassEntry,
  checker: Checker,
): { readonly entries: ClassEntry[]; readonly schema?: SchemaEntry | undefined } {
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

function schemaEntryProblems(schema: SchemaEntry, checker: Checker): Finding[] {
  return (schemaProblems(schema.expression, checker) ?? []).filter(({ field }) =>
    visible(schema, field),
  );
}

function aliasedName(declaration: TypeScript.Node | undefined): TypeScript.EntityName | undefined {
  return declaration !== undefined &&
    ts.isTypeAliasDeclaration(declaration) &&
    ts.isTypeReferenceNode(declaration.type)
    ? declaration.type.typeName
    : undefined;
}

function classDeclaration(
  name: TypeScript.EntityName,
  checker: Checker,
): TypeScript.ClassDeclaration | undefined {
  const pending = [name];
  for (const current of pending) {
    const identifier = ts.isQualifiedName(current) ? current.right : current;
    const declaration =
      ts.isIdentifier(identifier) && (checker !== undefined || identifier === current)
        ? declarationOf(identifier, checker)
        : undefined;
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

export function classProblems(
  name: TypeScript.EntityName,
  checker: Checker,
): Finding[] | undefined {
  if (classDeclaration(name, checker) === undefined) {
    return undefined;
  }
  const pending: ClassEntry[] = [
    { identifier: name, hidden: new Set<string | undefined>(), keep: () => true },
  ];
  const problems: Finding[] = [];
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
