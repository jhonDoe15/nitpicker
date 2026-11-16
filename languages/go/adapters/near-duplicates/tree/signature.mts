import type { Node } from 'web-tree-sitter';
import type {
  PlacedNode,
  ShapeNode,
} from '../../../../java/adapters/near-duplicates/jvm-types.mts';
import type { GoContext } from '../types/go-types.mts';
import {
  NONE,
  at,
  codeChildren,
  expression,
  field,
  fields,
  namedType,
  present,
  required,
  typeNode,
  typeText,
} from './nodes.mts';

const NAME = 'name';
const PARAMETER_KIND = 'parameter';

function blankName(source: Node): PlacedNode {
  return { ...at(NAME, source), kind: NAME, binding: 'bound', value: '_', text: '_' };
}

function declaredNames(declaration: Node, context: GoContext): ShapeNode[] {
  const names = fields(declaration, NAME);
  return names.length === 0 ? [blankName(declaration)] : names.map((name) => context.get(name));
}

function parameterOf(declaration: Node, name: ShapeNode): PlacedNode {
  const type = field(declaration, 'type');
  if (declaration.type === 'variadic_parameter_declaration') {
    const spread = namedType(`...${typeText(present(type))}`, present(type));
    return at(PARAMETER_KIND, declaration, [spread, expression('rest', declaration, [name])]);
  }
  return at(PARAMETER_KIND, declaration, [typeNode(type), name]);
}

function listParameters(list: Node, context: GoContext): PlacedNode[] {
  return codeChildren(list).flatMap((declaration) =>
    declaredNames(declaration, context).map((name) => parameterOf(declaration, name)),
  );
}

export function parametersOf(source: Node, context: GoContext): PlacedNode {
  const receiver = field(source, 'receiver');
  const list = field(source, 'parameters');
  return at('parameters', list ?? source, [
    ...(receiver === undefined ? [] : listParameters(receiver, context)),
    ...(list === undefined ? [] : listParameters(list, context)),
  ]);
}

export function resultOf(source: Node): ShapeNode {
  const result = field(source, 'result');
  if (result === undefined) {
    return NONE;
  }
  if (result.type !== 'parameter_list') {
    return typeNode(result);
  }
  const types = codeChildren(result).flatMap((declaration) => {
    const count = Math.max(fields(declaration, NAME).length, 1);
    return Array.from({ length: count }, () => typeText(required(declaration, 'type')));
  });
  return namedType(types.join(','), result);
}
