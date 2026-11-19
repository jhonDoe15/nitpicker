import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { EXTENSIONS, hasNoMiddleware } from '../../lookups/prisma-lookup.mts';
import { isAtLeast } from '../../../orm/project-files.mts';
import { isScalarField, prismaSchema } from '../../../orm/prisma-schema.mts';
import { plainProperty, valueOf } from '../../lookups/lookup-plan.mts';
import { spliced } from '../../text.mts';
import { isRowData } from './insert-data.mts';
import type { Insertion } from './insert-plan.mts';
import type { WriteSite } from '../write-loop.mts';

const CREATE_MANY_MAJOR = 4;

const PROVIDERS = new Set(['postgresql', 'mysql']);

function isScalarData(site: WriteSite, data: TSESTree.ObjectExpression): boolean {
  const { orm } = site;
  const schema = prismaSchema(orm.declarationFile);
  const fields = orm.model === undefined ? undefined : schema?.models.get(orm.model);
  if (schema === undefined || fields === undefined || data.properties.length === 0) {
    return false;
  }
  return data.properties.every((property) => {
    const field = plainProperty(property) ? fields.get(property.key.name) : undefined;
    return field !== undefined && isScalarField(schema, field);
  });
}

function mapped(site: WriteSite, data: TSESTree.ObjectExpression): string {
  return `(${site.loop.item.name}) => (${site.context.sourceCode.getText(data)})`;
}

export function prismaInsert(site: WriteSite): Insertion | undefined {
  const { call, orm, context } = site;
  const [argument] = call.arguments;
  const { callee } = call;
  const schema = prismaSchema(orm.declarationFile);
  const data =
    argument?.type === AST_NODE_TYPES.ObjectExpression ? valueOf(argument, 'data') : undefined;
  if (
    orm.orm !== 'prisma' ||
    orm.method !== 'create' ||
    call.arguments.length !== 1 ||
    argument?.type !== AST_NODE_TYPES.ObjectExpression ||
    argument.properties.length !== 1 ||
    data?.type !== AST_NODE_TYPES.ObjectExpression ||
    callee.type !== AST_NODE_TYPES.MemberExpression ||
    schema?.provider === undefined ||
    !PROVIDERS.has(schema.provider) ||
    !isAtLeast(orm.version, CREATE_MANY_MAJOR, 0) ||
    !hasNoMiddleware(orm) ||
    EXTENSIONS.test(context.sourceCode.text) ||
    !isScalarData(site, data) ||
    !isRowData(site, data)
  ) {
    return undefined;
  }
  return {
    callText: (part) =>
      spliced(context.sourceCode, call.range, [
        { range: callee.property.range, text: 'createMany' },
        { range: data.range, text: `${part}.map(${mapped(site, data)})` },
      ]),
  };
}
