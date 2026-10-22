import { staticKeyName } from '../analysis/static-shapes.mjs';
import { componentVisitor, declaratorOf } from './react-components.mjs';

const MAX_EXPANSIONS = 200;
const EXPANDING_TYPES = new Set(['TSUnionType', 'TSIntersectionType', 'TSTypeReference']);
const ARRAY_NAMES = new Set(['Array', 'ReadonlyArray']);
const PROPS_NAME = /Props$/u;

function pluralsOf(name) {
  const plurals = [`${name}s`, `${name}es`];
  return /[^aeiou]y$/u.test(name) ? [...plurals, `${name.slice(0, -1)}ies`] : plurals;
}

function optionalInputs(members) {
  const inputs = new Map();
  for (const member of members) {
    const annotation = member.typeAnnotation?.typeAnnotation;
    const name =
      member.type === 'TSPropertySignature'
        ? staticKeyName(member.key, member.computed)
        : undefined;
    if (name !== undefined && member.optional === true && annotation !== undefined) {
      inputs.set(name, { member, annotation });
    }
  }
  return inputs;
}

function membersOf(node) {
  if (node.type === 'TSTypeLiteral') {
    return node.members;
  }
  return node.type === 'TSInterfaceBody' ? node.body : [];
}

function expansionsOf(node, aliases) {
  if (node.type === 'TSUnionType') {
    return node.types.map((type) => [type]);
  }
  if (node.type === 'TSIntersectionType') {
    return [node.types];
  }
  const alias = node.typeName.type === 'Identifier' ? aliases.get(node.typeName.name) : undefined;
  return alias === undefined ? [[]] : [[alias.typeAnnotation]];
}

function branchesOf(root, aliases) {
  const branches = [];
  const pending = [[root]];
  for (const nodes of pending) {
    if (pending.length > MAX_EXPANSIONS) {
      break;
    }
    const index = nodes.findIndex((node) => EXPANDING_TYPES.has(node.type));
    if (index === -1) {
      branches.push(nodes.flatMap(membersOf));
      continue;
    }
    const rest = nodes.filter((_, position) => position !== index);
    for (const expansion of expansionsOf(nodes[index], aliases)) {
      pending.push([...rest, ...expansion]);
    }
  }
  return branches;
}

function elementTypeOf(declared) {
  const type =
    declared.type === 'TSTypeOperator' && declared.operator === 'readonly'
      ? declared.typeAnnotation
      : declared;
  if (type.type === 'TSArrayType') {
    return type.elementType;
  }
  const isArrayReference =
    type.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    ARRAY_NAMES.has(type.typeName.name);
  return isArrayReference ? (type.typeArguments ?? type.typeParameters)?.params[0] : undefined;
}

function pairsFor({ inputs, sourceCode }, singular) {
  return pluralsOf(singular).flatMap((plural) => {
    const entry = inputs.get(plural);
    const element = entry === undefined ? undefined : elementTypeOf(entry.annotation);
    const matches =
      element !== undefined &&
      sourceCode.getText(element) === sourceCode.getText(inputs.get(singular).annotation);
    return matches ? [{ singular, plural, node: entry.member }] : [];
  });
}

function pluralPairs(members, sourceCode) {
  const inputs = optionalInputs(members);
  return [...inputs.keys()].flatMap((singular) => pairsFor({ inputs, sourceCode }, singular));
}

function propsTypeOf(fn) {
  const [parameter] = fn.params;
  const annotation = parameter?.typeAnnotation?.typeAnnotation;
  if (annotation !== undefined) {
    return annotation;
  }
  const declared = declaratorOf(fn)?.id.typeAnnotation?.typeAnnotation;
  const typeArguments = declared?.typeArguments ?? declared?.typeParameters;
  return typeArguments?.params[0];
}

export const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow optional alternative props that take one item or a list of the same item',
    },
    schema: [],
    messages: {
      singularAndPlural:
        'Optional props `{{ singular }}` and `{{ plural }}` are two ways to pass the same data. Keep `{{ plural }}` and pass a single item as a one-element array.',
    },
  },
  create(context) {
    const aliases = new Map();
    const candidates = [];
    const reported = new Set();

    function check(typeNode) {
      const pairs = branchesOf(typeNode, aliases).flatMap((members) =>
        pluralPairs(members, context.sourceCode),
      );
      for (const { singular, plural, node } of pairs) {
        if (reported.has(node)) {
          continue;
        }
        reported.add(node);
        context.report({ node, messageId: 'singularAndPlural', data: { singular, plural } });
      }
    }

    return {
      ...componentVisitor(({ node }) => {
        const propsType = propsTypeOf(node);
        if (propsType !== undefined) {
          candidates.push(propsType);
        }
      }),
      TSTypeAliasDeclaration(node) {
        aliases.set(node.id.name, node);
        if (PROPS_NAME.test(node.id.name) && node.parent.type === 'ExportNamedDeclaration') {
          candidates.push(node.typeAnnotation);
        }
      },
      TSInterfaceDeclaration(node) {
        if (PROPS_NAME.test(node.id.name) && node.parent.type === 'ExportNamedDeclaration') {
          candidates.push(node.body);
        }
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          check(candidate);
        }
      },
    };
  },
};
