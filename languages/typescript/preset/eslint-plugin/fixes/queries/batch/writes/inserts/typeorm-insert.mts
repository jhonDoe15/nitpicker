import { AST_NODE_TYPES, type TSESTree } from '@typescript-eslint/utils';
import { hasArrayType } from '../../../../../rules/support/checked-types.mts';
import { spliced } from '../../text.mts';
import { isModernTypeorm } from '../../../orm/project-files.mts';
import { isRowData } from './insert-data.mts';
import type { Insertion } from './insert-plan.mts';
import { isSupportedDriver } from './typeorm-drivers.mts';
import type { WriteSite } from '../write-loop.mts';

function mapped(site: WriteSite, data: TSESTree.Expression): string {
  const { sourceCode } = site.context;
  const item = site.loop.item.name;
  const text = sourceCode.getText(data);
  const body = data.type === AST_NODE_TYPES.ObjectExpression ? `(${text})` : text;
  return `(${item}) => ${body}`;
}

export function typeormInsert(site: WriteSite): Insertion | undefined {
  const { call, orm, context } = site;
  const [data] = call.arguments;
  if (
    orm.orm !== 'typeorm' ||
    orm.method !== 'insert' ||
    call.arguments.length !== 1 ||
    data === undefined ||
    data.type === AST_NODE_TYPES.SpreadElement ||
    data.type === AST_NODE_TYPES.ArrayExpression ||
    !isModernTypeorm(orm.version) ||
    !isSupportedDriver(context.filename) ||
    hasArrayType(context, data) !== 'no' ||
    !isRowData(site, data)
  ) {
    return undefined;
  }
  const item = site.loop.item.name;
  const direct = data.type === AST_NODE_TYPES.Identifier && data.name === item;
  return {
    callText: (part) =>
      spliced(context.sourceCode, call.range, [
        { range: data.range, text: direct ? part : `${part}.map(${mapped(site, data)})` },
      ]),
  };
}
